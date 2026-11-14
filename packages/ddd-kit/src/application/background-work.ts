export interface IBackgroundWork {
  defer(work: Promise<unknown>): void;
}
