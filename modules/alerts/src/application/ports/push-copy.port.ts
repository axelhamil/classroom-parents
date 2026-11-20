import type { AlertContext } from "./alert-context-reader.port";

export interface PushText {
  title: string;
  body: string;
}

export interface PushCopyOptions {
  details: boolean;
}

export interface DigestChildCount {
  label: string;
  count: number;
}

export interface DigestSummary {
  total: number;
  children: DigestChildCount[];
  next: { title: string; date: string };
  today: string;
}

export interface IPushCopy {
  forAlerts(contexts: AlertContext[], options: PushCopyOptions): Promise<PushText>;
  forDigest(summary: DigestSummary, options: PushCopyOptions): Promise<PushText>;
  forAccessLoss(childLabel: string, options: PushCopyOptions): Promise<PushText>;
}
