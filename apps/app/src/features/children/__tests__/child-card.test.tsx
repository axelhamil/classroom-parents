// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "./render-app";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: { getSession: vi.fn(), linkSocial: vi.fn() },
}));

vi.mock("../../../shared/api/user-stream", () => ({
  connectUserStream: () => new Promise(() => undefined),
}));

const LINK_CONFIG = {
  providerId: "google-classroom",
  scopes: [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly",
  ],
  clientId: "school-client.apps.googleusercontent.com",
};

function child(id: string, label: string, status: string) {
  return { id, label, googleEmail: `${id.slice(0, 4)}@college.example`, status, syncing: false };
}

const BLOCKED = child("1a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Léa", "blocked_by_school");
const LEAVING = child("2a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Tom", "disconnecting");
const CONNECTED = child("3a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Inès", "connected");

const copy = frCatalog.children;

describe("children list", () => {
  afterEach(resetApp);

  it("given a child blocked by the school, then it shows what the school must do with the client id and every scope", async () => {
    fakeApi({
      "GET /children": { body: [BLOCKED] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp("/children");

    expect(await screen.findByText(copy.school.kinds.admin_blocked)).toBeTruthy();
    expect(await screen.findByText(LINK_CONFIG.clientId)).toBeTruthy();
    for (const scope of LINK_CONFIG.scopes) expect(screen.getByText(scope)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.school.share })).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.reconnect.action })).toBeTruthy();
  });

  it("given the school procedure and no Web Share, then sharing copies the whole procedure", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    fakeApi({
      "GET /children": { body: [BLOCKED] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp("/children");
    await screen.findByText(LINK_CONFIG.clientId);
    await userEvent.click(screen.getByRole("button", { name: copy.school.share }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const shared = writeText.mock.calls[0]?.[0];
    expect(shared).toContain(LINK_CONFIG.clientId);
    expect(shared).toContain(copy.school.steps.path);
  });

  it("given a child being disconnected, then it says so and offers no reconnection", async () => {
    fakeApi({ "GET /children": { body: [LEAVING] } });

    await renderApp("/children");

    expect(await screen.findByText(copy.status.disconnecting)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.reconnect.action })).toBeNull();
  });

  it("given a confirmed disconnection, then it explains the revocation and deletes the child", async () => {
    const calls = fakeApi({
      "GET /children": { body: [CONNECTED] },
      [`DELETE /children/${CONNECTED.id}`]: { status: 204 },
    });

    await renderApp("/children");
    await userEvent.click(await screen.findByRole("button", { name: copy.card.disconnect }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(copy.disconnect.description)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: copy.disconnect.confirm }));

    await waitFor(() =>
      expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual([
        `/children/${CONNECTED.id}`,
      ]),
    );
  });

  it("given no child yet, then it invites to add one", async () => {
    fakeApi({ "GET /children": { body: [] } });

    await renderApp("/children");

    expect(await screen.findByText(copy.list.emptyTitle)).toBeTruthy();
  });
});
