import { describe, expect, it } from "bun:test";
import { renderTemplate } from "@packages/emails";

describe("renderTemplate locale", () => {
  it("renders the French subject when asked", async () => {
    const out = await renderTemplate("verify_email", { name: "Ada", verifyUrl: "https://x" }, "fr");
    expect(out.subject).toBe("Confirmez votre adresse e-mail");
    expect(out.html).toContain("Bonjour Ada");
  });

  it("renders French when no locale is given", async () => {
    const out = await renderTemplate("verify_email", { name: "Ada", verifyUrl: "https://x" });
    expect(out.subject).toBe("Confirmez votre adresse e-mail");
  });

  it("interpolates variables into a localized subject", async () => {
    const out = await renderTemplate(
      "org_invitation",
      { inviterName: "Ada", orgName: "Acme", role: "member", inviteUrl: "https://x" },
      "fr",
    );
    expect(out.subject).toBe("Invitation à rejoindre Acme");
  });

  it("translates the body, not only the subject", async () => {
    const out = await renderTemplate(
      "reset_password",
      { name: "Ada", resetUrl: "https://x/r" },
      "fr",
    );
    expect(out.html).toContain("Réinitialisez votre mot de passe");
    expect(out.text).toContain("Bonjour Ada");
    expect(out.text).not.toContain("Hi Ada");
    expect(out.text).not.toContain("If you did not expect this email");
  });
});
