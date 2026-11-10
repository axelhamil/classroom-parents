// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "../../../shared/auth/auth-client";
import { errorReply, fakeApi, renderApp, resetApp } from "./render-app";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
    linkSocial: vi.fn(async () => ({
      data: { url: "https://accounts.google.com", redirect: true },
    })),
  },
}));

vi.mock("../../../shared/api/user-stream", () => ({
  connectUserStream: () => new Promise(() => undefined),
}));

const CHILD_ID = "8a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";
const LINK_CONFIG = {
  providerId: "google-classroom",
  scopes: ["https://www.googleapis.com/auth/classroom.courses.readonly"],
  clientId: "client.apps.googleusercontent.com",
};
const LEA = {
  id: CHILD_ID,
  label: "Léa",
  googleEmail: "lea@college.example",
  status: "connected",
  syncing: true,
};

const copy = frCatalog.children;

function posts(calls: ReturnType<typeof fakeApi>, path: string) {
  return calls.filter((call) => call.method === "POST" && call.path === path);
}

describe("adding a child after the Google round trip", () => {
  afterEach(resetApp);

  it("given one linkable account, then it registers that account once, starts its sync and shows the first sync", async () => {
    const calls = fakeApi({
      "GET /children/linkable": {
        body: [{ linkedAccountId: "acc-1", googleEmail: LEA.googleEmail }],
      },
      "POST /children": { status: 201, body: LEA },
      [`POST /sync/${CHILD_ID}`]: { status: 202, body: { status: "started" } },
      "GET /children": { body: [LEA] },
      "GET /events": { body: { items: [] } },
    });

    await renderApp("/children/new?linked=1");

    expect(await screen.findByText(copy.firstSync.running)).toBeTruthy();
    await waitFor(() => expect(posts(calls, `/sync/${CHILD_ID}`)).toHaveLength(1));
    expect(posts(calls, "/children").map((call) => call.body)).toEqual([
      { linkedAccountId: "acc-1" },
    ]);
  });

  it("given two linkable accounts, then it asks which one and registers nothing before the choice", async () => {
    const calls = fakeApi({
      "GET /children/linkable": {
        body: [
          { linkedAccountId: "acc-1", googleEmail: "lea@college.example" },
          { linkedAccountId: "acc-2", googleEmail: "tom@ecole.example" },
        ],
      },
      "POST /children": { status: 201, body: LEA },
      [`POST /sync/${CHILD_ID}`]: { status: 202, body: { status: "started" } },
      "GET /children": { body: [LEA] },
      "GET /events": { body: { items: [] } },
    });

    await renderApp("/children/new?linked=1");

    const tom = await screen.findByRole("button", { name: "tom@ecole.example" });
    expect(screen.getByText(copy.new.pickTitle)).toBeTruthy();
    expect(posts(calls, "/children")).toHaveLength(0);

    await userEvent.click(tom);

    await waitFor(() =>
      expect(posts(calls, "/children").map((call) => call.body)).toEqual([
        { linkedAccountId: "acc-2" },
      ]),
    );
  });

  it("given the account is already followed, then it says so in French and offers another account", async () => {
    fakeApi({
      "GET /children/linkable": {
        body: [{ linkedAccountId: "acc-1", googleEmail: LEA.googleEmail }],
      },
      "POST /children": errorReply(409, "CHILD_ALREADY_CONNECTED"),
    });

    await renderApp("/children/new?linked=1");

    expect(await screen.findByText(frCatalog.errors.byCode.CHILD_ALREADY_CONNECTED)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.new.retry })).toBeTruthy();
  });

  it("given Classroom scopes were not granted, then it explains them and discards the unusable link before starting again", async () => {
    const calls = fakeApi({
      "GET /children/linkable": {
        status: 400,
        body: {
          error: {
            code: "CHILD_SCOPES_MISSING",
            message: "server copy",
            metadata: { unusableLinkedAccountIds: ["acc-9"] },
          },
        },
      },
      "POST /children/linkable/acc-9/discard": { status: 204 },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp("/children/new?linked=1");

    expect(await screen.findByText(frCatalog.errors.byCode.CHILD_SCOPES_MISSING)).toBeTruthy();
    expect(posts(calls, "/children")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: copy.new.discard }));

    await waitFor(() => expect(authClient.linkSocial).toHaveBeenCalledOnce());
    expect(posts(calls, "/children/linkable/acc-9/discard")).toHaveLength(1);
  });
});

describe("reconnecting a child", () => {
  afterEach(resetApp);

  it("given a child to reconnect, then Reconnecter goes through Google and calls reconnect once back", async () => {
    const broken = { ...LEA, status: "needs_reconnect", cause: "invalid_grant", syncing: false };
    const calls = fakeApi({
      "GET /children": { body: [broken] },
      "GET /children/link-config": { body: LINK_CONFIG },
      [`POST /children/${CHILD_ID}/reconnect`]: { body: { ...broken, status: "connected" } },
      [`POST /sync/${CHILD_ID}`]: { status: 202, body: { status: "started" } },
    });

    const view = await renderApp("/children");
    await userEvent.click(await screen.findByRole("button", { name: copy.reconnect.action }));

    await waitFor(() =>
      expect(authClient.linkSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google-classroom",
          scopes: LINK_CONFIG.scopes,
          callbackURL: `${window.location.origin}/children?reconnect=${CHILD_ID}`,
        }),
      ),
    );
    expect(posts(calls, `/children/${CHILD_ID}/reconnect`)).toHaveLength(0);

    view.unmount();
    await renderApp(`/children?reconnect=${CHILD_ID}`);

    await waitFor(() => expect(posts(calls, `/children/${CHILD_ID}/reconnect`)).toHaveLength(1));
  });
});
