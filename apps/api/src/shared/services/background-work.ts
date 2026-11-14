import type { IBackgroundWork, IInstrumentation } from "@packages/ddd-kit";

export class BackgroundWork implements IBackgroundWork {
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly instrumentation: IInstrumentation) {}

  defer(work: Promise<unknown>): void {
    const tracked = work.then(
      () => undefined,
      (err: unknown) => this.instrumentation.capture(err),
    );
    this.running.add(tracked);
    void tracked.finally(() => this.running.delete(tracked));
  }

  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }
}
