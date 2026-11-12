// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";
import { type ApiCall, fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";

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

    expect(await heading(copy.connect.blockedTitle)).toBeTruthy();
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

  it("a parent back from Google with an account still to register resumes it instead of the welcome", async () => {
    fakeApi({
      "GET /children": { body: [] },
      "GET /children/linkable": {
        body: [
          { linkedAccountId: "acc-1", googleEmail: "lea@college.example" },
          { linkedAccountId: "acc-2", googleEmail: "tom@ecole.example" },
        ],
      },
    });

    await renderApp("/");

    expect(await screen.findByText(copy.connect.pickTitle)).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: copy.welcome.title })).toBeNull();
  });

  it("analysis offers to reconnect instead of loading forever when the account needs it", async () => {
    fakeApi({
      "GET /children": {
        body: [{ ...LEA, status: "needs_reconnect", cause: "invalid_grant", syncing: false }],
      },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=analysis`);

    expect(await heading(copy.analysis.reconnectTitle)).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: copy.analysis.phases.courses })).toBeNull();
    expect(screen.getByRole("link", { name: copy.analysis.addAnother })).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.connect.later })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: copy.analysis.reconnect }));

    await waitFor(() =>
      expect(authClient.linkSocial).toHaveBeenCalledWith(
        expect.objectContaining({ loginHint: LEA.googleEmail }),
      ),
    );
  });

  it("analysis offers to read Classroom again when the first read failed", async () => {
    let syncing = false;
    const calls = fakeApi({
      "GET /children": () => ({ body: [{ ...LEA, syncing }] }),
      [`POST /sync/${CHILD_ID}`]: () => {
        syncing = true;
        return { status: 202, body: { status: "started" } };
      },
    });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=analysis`);

    expect(await heading(copy.analysis.failedTitle)).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: copy.analysis.phases.courses })).toBeNull();
    expect(screen.getByRole("link", { name: copy.analysis.addAnother })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: copy.analysis.retry }));

    await waitFor(() => expect(posts(calls, `/sync/${CHILD_ID}`)).toHaveLength(1));
    expect(
      await screen.findByRole("progressbar", { name: copy.analysis.phases.courses }),
    ).toBeTruthy();
  });

  it("a school block at Analyse offers another child or finishing later", async () => {
    fakeApi({
      "GET /children": {
        body: [{ ...LEA, status: "blocked_by_school", cause: "school_blocked", syncing: false }],
      },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=analysis`);

    expect(await screen.findByRole("link", { name: copy.analysis.addAnother })).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.connect.later })).toBeTruthy();
  });

  it("reminders step saves and continues with one primary action and reads naturally", async () => {
    const calls = fakeApi({
      "GET /children": { body: [LEA_SYNCED] },
      "GET /reminders/defaults": {
        body: {
          reminders: [
            { kind: "days_before", days: 2, time: "18:00" },
            { kind: "days_before", days: 1, time: "19:00" },
          ],
        },
      },
      "PUT /reminders/defaults": {
        body: { reminders: [{ kind: "days_before", days: 2, time: "18:00" }] },
      },
      "GET /events": {
        body: {
          items: [
            { ...EVENT_BASE, childId: CHILD_ID, title: "Piscine", deadlineDate: "2026-11-20" },
          ],
        },
      },
      "GET /push/status": { body: { live: 0 } },
    });

    await renderApp(`/onboarding?child=${CHILD_ID}&step=reminders`);

    expect(await screen.findByText(/et la veille, à 19/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: frCatalog.common.actions.save })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: copy.reminders.save }));

    expect(await heading(copy.notifications.title)).toBeTruthy();
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });
});
