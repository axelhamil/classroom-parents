import type { AlertContext } from "./alert-context-reader.port";

export interface PushText {
  title: string;
  body: string;
}

export interface PushCopyOptions {
  details: boolean;
}

export interface IPushCopy {
  forAlerts(contexts: AlertContext[], options: PushCopyOptions): Promise<PushText>;
  forWeek(count: number): Promise<string>;
}
