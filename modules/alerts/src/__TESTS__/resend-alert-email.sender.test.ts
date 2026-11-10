import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { ResendAlertEmailSender } from "../infrastructure/adapters/resend-alert-email.sender";

describe("ResendAlertEmailSender", () => {
  it("given a title written by a teacher with markup, then the html body escapes it and the send is idempotent per alert", async () => {
    const emails = mockPort<IEmailService>();
    emails.sendRaw.mockResolvedValue(Result.ok());

    await new ResendAlertEmailSender(emails, mockInstrumentation()).send("parent@example.com", {
      alertId: "alert-1",
      eventTitle: "<img src=x onerror=alert(1)> Contrôle",
      childLabel: "Léa",
      deadlineLabel: "jeudi 19 novembre",
      eventUrl: "https://app.example.com/events/1",
    });

    const [to, , body, options] = emails.sendRaw.mock.calls[0] ?? [];
    expect(to).toBe("parent@example.com");
    expect(body?.html).toContain("&lt;img src=x onerror=alert(1)&gt; Contrôle");
    expect(body?.html).not.toContain("<img");
    expect(options).toEqual({ idempotencyKey: "alert-alert-1" });
  });
});
