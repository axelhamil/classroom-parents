// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: { getSession: vi.fn(), linkSocial: vi.fn() },
}));

const LINK_CONFIG = {
  providerId: "google-classroom",
  scopes: [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
  ],
  clientId: "school-client.apps.googleusercontent.com",
};

const copy = frCatalog.help.school.message;

async function openGuide() {
  fakeApi({ "GET /children/link-config": { body: LINK_CONFIG } });
  await renderApp("/aide/ecole");

  return screen.findByRole<HTMLTextAreaElement>("textbox", { name: copy.label });
}

function mailtoParts() {
  const href = screen.getByRole("link", { name: copy.open }).getAttribute("href") ?? "";
  const params = new URLSearchParams(href.slice(href.indexOf("?")));

  return { href, subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
}

describe("school help", () => {
  afterEach(resetApp);

  it("given the app's Google config, then the request names the client id, every read only scope and the admin guide", async () => {
    const message = await openGuide();

    expect(message.value).toContain(`ID client OAuth : ${LINK_CONFIG.clientId}`);
    for (const scope of LINK_CONFIG.scopes) expect(message.value).toContain(scope);
    expect(message.value).toMatch(/Guide pas à pas pour l'administrateur : https?:\/\/\S+\/ecoles/);
    expect(message.value).toContain("/legal/privacy-policy");
    expect(message.value).toContain("/legal/sub-processors");
  });

  it("given the parent edits the request, then the mail it opens carries the edited text and the subject", async () => {
    const message = await openGuide();

    await userEvent.clear(message);
    await userEvent.type(message, "Bonjour, élève de 4e B.");

    const { href, subject, body } = mailtoParts();
    expect(href.startsWith("mailto:?")).toBe(true);
    expect(subject).toBe(copy.subject.replace("{{brand}}", frCatalog.common.brand));
    expect(body).toBe("Bonjour, élève de 4e B.");
  });

  it("given the parent copies the request, then the clipboard receives the text on screen", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const message = await openGuide();

    await userEvent.click(screen.getByRole("button", { name: copy.copy }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(message.value));
  });
});
