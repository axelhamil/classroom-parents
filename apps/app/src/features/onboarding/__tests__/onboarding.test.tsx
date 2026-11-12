// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiCall, fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: { getSession: vi.fn(), linkSocial: vi.fn() },
}));

vi.mock("../../../shared/api/user-stream", () => ({
  connectUserStream: () => new Promise(() => undefined),
}));

const CHILD_ID = "8a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";
const LINK_CONFIG = {
  providerId: "google-classroom",
  scopes: ["https://www.googleapis.com/auth/classroom.courses.readonly"],
  clientId: "school-client.apps.googleusercontent.com",
};
const LEA = {
  id: CHILD_ID,
  label: "Léa",
  googleEmail: "lea@college.example",
  status: "connected",
  syncing: true,
};
const LEA_SYNCED = { ...LEA, syncing: false, lastSyncedAt: "2026-11-12T07:30:00.000Z" };

const copy = frCatalog.onboarding;

function heading(name: string) {
  return screen.findByRole("heading", { level: 1, name });
}

function posts(calls: ApiCall[], path: string) {
  return calls.filter((call) => call.method === "POST" && call.path === path);
}

describe("guided first child onboarding", () => {
  afterEach(resetApp);

  it("parent with no child is sent to onboarding", async () => {
    fakeApi({ "GET /children": { body: [] }, "GET /events": { body: { items: [] } } });

    await renderApp("/");

    expect(await heading(copy.welcome.title)).toBeTruthy();
    expect(screen.getByText("Étape 1 sur 8")).toBeTruthy();
  });

  it("onboarding resumes at Analyse after the OAuth return", async () => {
    let family: unknown[] = [];
    const calls = fakeApi({
      "GET /children/linkable": {
        body: [{ linkedAccountId: "acc-1", googleEmail: LEA.googleEmail }],
      },
      "POST /children": () => {
        family = [LEA];
        return { status: 201, body: LEA };
      },
      [`POST /sync/${CHILD_ID}`]: { status: 202, body: { status: "started" } },
      "GET /children": () => ({ body: family }),
      [`PATCH /children/${CHILD_ID}`]: { body: { ...LEA, label: "Léa-Rose" } },
      "GET /events": { body: { items: [] } },
    });

    await renderApp("/onboarding?linked=1");

    expect(await heading(copy.name.title)).toBeTruthy();
    const field = screen.getByLabelText(copy.name.label);
    expect(field).toHaveProperty("value", "Léa");
    await waitFor(() => expect(posts(calls, `/sync/${CHILD_ID}`)).toHaveLength(1));

    await userEvent.clear(field);
    await userEvent.type(field, "Léa-Rose");
    await userEvent.click(screen.getByRole("button", { name: copy.name.next }));

    expect(await heading(copy.analysis.title)).toBeTruthy();
    expect(screen.getByText("Étape 5 sur 8")).toBeTruthy();
    expect(calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([
      { label: "Léa-Rose" },
    ]);
    expect(posts(calls, "/children")).toHaveLength(1);
  });

  it("onboarding shows the school procedure when the school blocks", async () => {
    fakeApi({
      "GET /children": { body: [] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp("/onboarding?error=admin_policy_enforced");

    expect(await heading(copy.connect.title)).toBeTruthy();
    expect(screen.getByText(frCatalog.children.school.title)).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: frCatalog.children.school.share }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.connect.tryAgain })).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.connect.later })).toBeTruthy();
  });

  it("notifications step can be skipped", async () => {
    fakeApi({
      "GET /children": { body: [LEA_SYNCED] },
      "GET /push/status": { body: { live: 0 } },
      "GET /reminders/defaults": { body: { reminders: [] } },
    });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=notifications`);

    expect(await heading(copy.notifications.title)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: copy.notifications.skip }));

    expect(await heading(copy.done.title)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.done.home })).toBeTruthy();
  });

  it("a step after the first sync waits on Analyse while Classroom is still read", async () => {
    fakeApi({ "GET /children": { body: [LEA] }, "GET /events": { body: { items: [] } } });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=done`);

    expect(await heading(copy.analysis.title)).toBeTruthy();
  });
});
