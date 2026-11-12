import type { AlertContext } from "./alert-context-reader.port";

export interface PushText {
  title: string;
  body: string;
}

export interface IPushCopy {
  forAlerts(contexts: AlertContext[]): Promise<PushText>;
}
