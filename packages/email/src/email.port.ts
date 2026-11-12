import type { Result } from "@packages/ddd-kit";
import type { EmailTemplates } from "@packages/emails";
import type { Locale } from "@packages/i18n";

export type { EmailTemplates };
export type TemplateVariables = Record<string, string | number>;

export interface EmailBody {
  html?: string;
  text?: string;
}

export type EmailError =
  | { code: "EMAIL_TRANSPORT_NOT_CONFIGURED"; message: string; cause?: unknown }
  | { code: "EMAIL_PROVIDER_FAILURE"; message: string; cause?: unknown };

export interface SendTemplateOptions {
  idempotencyKey?: string;
  from?: string;
  /**
   * The recipient's locale. Named rather than positional so a call site that
   * has no locale to give simply omits it, instead of parking an `undefined`
   * placeholder that reads like a deliberate choice.
   */
  locale?: Locale;
  /**
   * Deletes the queued row, recipient address included, the moment it is sent or refused,
   * instead of keeping it for the retention window. Dead, it keeps its replays and is
   * deleted at its final death, when its next replay would fall past the replay window, or
   * by the retention sweep once past that window, which bounds the address to it. For a message whose recipient must leave no
   * trace, such as the account deletion confirmation.
   */
  eraseOnSettle?: boolean;
}

export interface EmailRecipient<K extends keyof EmailTemplates> {
  to: string;
  variables: EmailTemplates[K] & TemplateVariables;
  locale?: Locale;
  /**
   * Per-recipient idempotency key. Overrides the batch-level
   * `SendTemplateOptions.idempotencyKey`, whose positional suffix is unstable when
   * the batch is rebuilt from a partially-successful set. Must not contain `#`.
   */
  idempotencyKey?: string;
}

export interface IEmailService {
  sendTemplate<K extends keyof EmailTemplates>(
    template: K,
    to: string,
    variables: EmailTemplates[K] & TemplateVariables,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendRaw(
    to: string,
    subject: string,
    body: EmailBody,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendTemplateBatch<K extends keyof EmailTemplates>(
    template: K,
    recipients: EmailRecipient<K>[],
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;

  sendRawBatch(
    messages: Array<{ to: string; subject: string; body: EmailBody }>,
    options?: SendTemplateOptions,
  ): Promise<Result<void, EmailError>>;
}
