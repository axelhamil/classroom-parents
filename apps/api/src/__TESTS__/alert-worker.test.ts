import { beforeEach, describe, expect, it } from "bun:test";
import { DISPATCH_BATCH } from "@modules/alerts/application/config/dispatch-budget";
import type {
  AlertDispatchService,
  DispatchOutcome,
} from "@modules/alerts/application/services/alert-dispatch.service";
import { type AppError, type ILogger, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { NoOpInstrumentation } from "../shared/services/noop-instrumentation";
import { ALERT_TICK_MS, drainDueAlerts } from "../workers/alert-worker";

type Dispatcher = Pick<AlertDispatchService, "runOnce">;

let dispatcher: PortMock<Dispatcher>;
let logger: PortMock<ILogger>;

function outcome(claimed: number): Result<DispatchOutcome, AppError> {
  return Result.ok({ claimed, sent: claimed, emailed: 0, missed: 0 });
}

function deps() {
  return { AlertDispatchService: dispatcher, IInstrumentation: new NoOpInstrumentation() };
}

beforeEach(() => {
  dispatcher = mockPort<Dispatcher>();
  logger = mockPort<ILogger>();
});

describe("drainDueAlerts", () => {
  it("given full batches then a partial one, then the whole queue is dispatched in the same tick", async () => {
    dispatcher.runOnce
      .mockResolvedValueOnce(outcome(DISPATCH_BATCH))
      .mockResolvedValueOnce(outcome(DISPATCH_BATCH))
      .mockResolvedValueOnce(outcome(5));

    await drainDueAlerts(deps(), new AbortController().signal, logger);

    expect(dispatcher.runOnce).toHaveBeenCalledTimes(3);
  });

  it("given a queue that never empties, then the tick stops once its time budget is spent", async () => {
    let now = 0;
    dispatcher.runOnce.mockImplementation(async () => {
      now += ALERT_TICK_MS / 3;
      return outcome(DISPATCH_BATCH);
    });

    await drainDueAlerts(deps(), new AbortController().signal, logger, () => now);

    expect(dispatcher.runOnce).toHaveBeenCalledTimes(3);
  });

  it("given the server stops, then no further batch is claimed", async () => {
    const controller = new AbortController();
    dispatcher.runOnce.mockImplementation(async () => {
      controller.abort();
      return outcome(DISPATCH_BATCH);
    });

    await drainDueAlerts(deps(), controller.signal, logger);

    expect(dispatcher.runOnce).toHaveBeenCalledTimes(1);
  });

  it("given a failing batch, then the tick stops and warns", async () => {
    dispatcher.runOnce.mockResolvedValue(
      Result.fail({ code: "ALERT_PROVIDER_FAILURE", message: "down" }),
    );

    await drainDueAlerts(deps(), new AbortController().signal, logger);

    expect(dispatcher.runOnce).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
