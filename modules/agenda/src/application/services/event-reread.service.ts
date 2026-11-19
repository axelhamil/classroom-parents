import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
  traced,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { AgendaEvent, AnnouncementReading, EventField } from "../../domain/event.aggregate";
import type { IChildOwnership } from "../ports/child-ownership.port";
import {
  type AgendaError,
  childNotFound,
  type IEventRepository,
} from "../ports/event-repository.port";
import { parseEvidence, parsePreparation } from "./event-fields";
import type { IngestedEvent } from "./event-ingest.service";

export interface RereadInput {
  userId: string;
  childId: string;
  announcementId: string;
  events: IngestedEvent[];
}

export interface RereadOutput {
  matched: number;
  changed: number;
  unmatched: number;
}

type RereadError = AgendaError | AppError;

interface PlannedChange {
  event: AgendaEvent;
  fields: EventField[];
}

interface RereadPlan {
  changes: PlannedChange[];
  output: RereadOutput;
}

export class EventRereadService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IChildOwnership,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async preview(input: RereadInput): Promise<Result<RereadOutput, RereadError>> {
    return traced(this.instrumentation, "EventRereadService > preview", async () => {
      const owned = await this.ensureOwned(input);
      if (owned.isFailure) return Result.fail(owned.getError());

      const planned = await this.plan(input);
      return planned.map(({ output }) => output);
    });
  }

  async apply(input: RereadInput): Promise<Result<RereadOutput, RereadError>> {
    return traced(this.instrumentation, "EventRereadService > apply", async () => {
      const owned = await this.ensureOwned(input);
      if (owned.isFailure) return Result.fail(owned.getError());

      return this.transactions.run(async (): Promise<Result<RereadOutput, RereadError>> => {
        const planned = await this.plan(input);
        if (planned.isFailure) return Result.fail(planned.getError());

        for (const change of planned.getValue().changes) {
          const saved = await this.save(change);
          if (saved.isFailure) return Result.fail(saved.getError());
        }
        return Result.ok(planned.getValue().output);
      });
    });
  }

  private async ensureOwned(input: RereadInput): Promise<Result<void, RereadError>> {
    const owned = await this.children.isOwnedBy(input.userId, input.childId);
    if (owned.isFailure) return Result.fail(owned.getError());
    if (!owned.getValue()) return Result.fail(childNotFound);

    return Result.ok();
  }

  private async plan(input: RereadInput): Promise<Result<RereadPlan, RereadError>> {
    const stored = await this.events.lockAnnouncementItems(
      input.userId,
      input.childId,
      input.announcementId,
    );
    if (stored.isFailure) return Result.fail(stored.getError());

    const byOrdinal = new Map(stored.getValue().map((event) => [event.get("ordinal"), event]));
    const plan: RereadPlan = { changes: [], output: { matched: 0, changed: 0, unmatched: 0 } };
    for (const [ordinal, raw] of input.events.entries()) {
      const target = this.sameDeadline(byOrdinal.get(ordinal), raw);
      const reading = this.readingOf(raw);
      if (target.isNone() || reading.isNone()) {
        plan.output.unmatched += 1;
        continue;
      }

      plan.output.matched += 1;
      const fields = target.unwrap().reread(reading.unwrap());
      if (fields.isFailure || fields.getValue().length === 0) continue;

      plan.output.changed += 1;
      plan.changes.push({ event: target.unwrap(), fields: fields.getValue() });
    }
    return Result.ok(plan);
  }

  private sameDeadline(stored: AgendaEvent | undefined, raw: IngestedEvent): Option<AgendaEvent> {
    return Option.fromNullable(stored).filter(
      (event) => event.get("deadline").value.date === raw.deadlineDate,
    );
  }

  private readingOf(raw: IngestedEvent): Option<AnnouncementReading> {
    const preparation = parsePreparation({
      parentActions: raw.parentActions ?? [],
      toBring: raw.toBring ?? [],
    });
    const evidence = Option.fromNullable(raw.evidence).tryMap(parseEvidence);
    if (preparation.isSuccess && evidence.isSuccess)
      return Option.some({ evidence: evidence.getValue(), preparation: preparation.getValue() });

    this.instrumentation.capture(new Error("reread ignored: invalid evidence or preparation"));
    return Option.none();
  }

  private async save({ event, fields }: PlannedChange): Promise<Result<void, RereadError>> {
    const saved = await this.events.save(event);
    if (saved.isFailure) return Result.fail(saved.getError());

    await emitEvent(this.outbox, EventTypes.EVENT_UPDATED, "event", event.id.value, {
      userId: event.get("userId"),
      eventId: event.id.value,
      fields,
      actorUserId: null,
    });
    return Result.ok();
  }
}
