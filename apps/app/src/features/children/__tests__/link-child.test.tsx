// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorReply, fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";

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
const onboarding = frCatalog.onboarding;

function posts(calls: ReturnType<typeof fakeApi>, path: string) {
  return calls.filter((call) => call.method === "POST" && call.path === path);
}

describe("adding a child after the Google round trip", () => {
  afterEach(resetApp);

  it("given one linkable account, then it registers that account once, starts its sync and asks for the name", async () => {
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

    expect(
      await screen.findByRole("heading", { level: 1, name: onboarding.name.title }),
    ).toBeTruthy();
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
    expect(screen.getByText(onboarding.connect.pickTitle)).toBeTruthy();
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
      "GET /children": { body: [] },
    });

    await renderApp("/children/new?linked=1");

    expect(await screen.findByText(frCatalog.errors.byCode.CHILD_ALREADY_CONNECTED)).toBeTruthy();
    expect(screen.getByRole("button", { name: onboarding.connect.retry })).toBeTruthy();
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
      "GET /children": { body: [] },
    });

    await renderApp("/children/new?linked=1");

    expect(await screen.findByText(frCatalog.errors.byCode.CHILD_SCOPES_MISSING)).toBeTruthy();
    expect(posts(calls, "/children")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: onboarding.connect.discard }));

    await waitFor(() => expect(authClient.linkSocial).toHaveBeenCalledOnce());
    expect(posts(calls, "/children/linkable/acc-9/discard")).toHaveLength(1);
  });
});

describe("first sync after adding a child", () => {
  afterEach(resetApp);

  it("given the first read ends blocked by the school, then it never says the account is ready", async () => {
    const blocked = {
      ...LEA,
      status: "blocked_by_school",
      cause: "school_blocked",
      syncing: false,
    };
    fakeApi({
      "GET /children": { body: [blocked] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp(`/children/new?child=${CHILD_ID}&step=analysis`);

    expect(await screen.findByText(copy.school.kinds.admin_blocked)).toBeTruthy();
    expect(
      screen.queryByText(onboarding.analysis.found.replace("{{label}}", LEA.label)),
    ).toBeNull();
    expect(screen.queryByText(onboarding.analysis.noEvent)).toBeNull();
  });
});

describe("refused Google link", () => {
  afterEach(resetApp);

  it("given the account is linked to another parent, then it says so without the school procedure", async () => {
    fakeApi({ "GET /children/link-config": { body: LINK_CONFIG } });

    await renderApp("/children/link-error?error=account_already_linked_to_different_user");

    expect(await screen.findByText(copy.linkError.kinds.already_linked)).toBeTruthy();
    expect(screen.queryByText(copy.school.title)).toBeNull();
  });

  it("given a refused reconnection, then Réessayer reconnects the same child", async () => {
    const broken = { ...LEA, status: "needs_reconnect", cause: "invalid_grant", syncing: false };
    fakeApi({
      "GET /children": { body: [broken] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp(`/children/link-error?error=access_denied&reconnect=${CHILD_ID}`);
    await userEvent.click(await screen.findByRole("button", { name: copy.linkError.retry }));

    await waitFor(() =>
      expect(authClient.linkSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: `${window.location.origin}/children?reconnect=${CHILD_ID}`,
          errorCallbackURL: `${window.location.origin}/children/link-error?reconnect=${CHILD_ID}`,
          loginHint: LEA.googleEmail,
        }),
      ),
    );
  });

  it("given Google refuses an addition, then the add flow explains it in place and offers to try again", async () => {
    fakeApi({
      "GET /children": { body: [LEA] },
      "GET /children/link-config": { body: LINK_CONFIG },
    });

    await renderApp("/children/new?error=access_denied");

    expect(await screen.findByText(copy.school.kinds.access_denied)).toBeTruthy();
    expect(screen.getByRole("button", { name: onboarding.connect.tryAgain })).toBeTruthy();
  });

  it("given a refused addition, then Réessayer starts adding a child again", async () => {
    fakeApi({ "GET /children/link-config": { body: LINK_CONFIG } });

    await renderApp("/children/link-error?error=access_denied");
    await userEvent.click(await screen.findByRole("button", { name: copy.linkError.retry }));

    await waitFor(() =>
      expect(authClient.linkSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL: `${window.location.origin}/children/new?linked=1`,
          errorCallbackURL: `${window.location.origin}/children/new`,
        }),
      ),
    );
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
          errorCallbackURL: `${window.location.origin}/children/link-error?reconnect=${CHILD_ID}`,
          loginHint: LEA.googleEmail,
        }),
      ),
    );
    expect(posts(calls, `/children/${CHILD_ID}/reconnect`)).toHaveLength(0);

    view.unmount();
    await renderApp(`/children?reconnect=${CHILD_ID}`);

    await waitFor(() => expect(posts(calls, `/children/${CHILD_ID}/reconnect`)).toHaveLength(1));
  });
});
