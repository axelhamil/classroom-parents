// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: { getSession: vi.fn(), linkSocial: vi.fn() },
}));

vi.mock("../../../shared/api/user-stream", () => ({
  connectUserStream: () => new Promise(() => undefined),
}));

function child(id: string, label: string, status: string) {
  return { id, label, googleEmail: `${id.slice(0, 4)}@college.example`, status, syncing: false };
}

const BLOCKED = child("1a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Léa", "blocked_by_school");
const LEAVING = child("2a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Tom", "disconnecting");
const CONNECTED = child("3a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f", "Inès", "connected");

const copy = frCatalog.children;

async function openMenu(label: string) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const trigger = await screen.findByRole("button", { name: `Actions pour ${label}` });
  await userEvent.click(trigger);
}

describe("children list", () => {
  afterEach(resetApp);

  it("given a child blocked by the school, then it points to the request for the school and offers to reconnect", async () => {
    fakeApi({ "GET /children": { body: [BLOCKED] } });

    await renderApp("/children");

    expect(await screen.findByText(copy.school.kinds.admin_blocked)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.school.guide }).getAttribute("href")).toBe(
      "/aide/ecole",
    );
    expect(screen.getByRole("button", { name: copy.reconnect.action })).toBeTruthy();
  });

  it("child card exposes customize, sync and disconnect in its menu", async () => {
    const calls = fakeApi({
      "GET /children": { body: [CONNECTED] },
      [`POST /sync/${CONNECTED.id}`]: { status: 202, body: { status: "started" } },
    });

    await renderApp("/children");
    await openMenu(CONNECTED.label);

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      copy.card.customize,
      copy.card.sync,
      copy.card.disconnect,
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: copy.card.sync }));

    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === "POST" && call.path === `/sync/${CONNECTED.id}`),
      ).toHaveLength(1),
    );
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
    await openMenu(CONNECTED.label);
    await userEvent.click(await screen.findByRole("menuitem", { name: copy.card.disconnect }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(copy.disconnect.description)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: copy.disconnect.confirm }));

    await waitFor(() =>
      expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual([
        `/children/${CONNECTED.id}`,
      ]),
    );
  });

  it("given another color picked while customizing, then only the color is saved and the sibling's color stays marked", async () => {
    const ines = { ...CONNECTED, color: 1 };
    const tom = {
      ...LEAVING,
      id: "4a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
      status: "connected",
      color: 2,
    };
    const calls = fakeApi({
      "GET /children": { body: [ines, tom] },
      [`PATCH /children/${ines.id}`]: { body: { ...ines, color: 3 } },
    });

    await renderApp("/children");
    await openMenu(ines.label);
    await userEvent.click(await screen.findByRole("menuitem", { name: copy.card.customize }));

    const dialog = await screen.findByRole("dialog", { name: copy.customize.title });
    expect(within(dialog).getByRole("radio", { name: copy.customize.hues.teal })).toHaveProperty(
      "ariaChecked",
      "true",
    );
    expect(
      within(dialog).getByRole("radio", {
        name: copy.customize.hues.blue,
        description: `Déjà la couleur de ${tom.label}`,
      }),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("radio", { name: copy.customize.hues.violet }));
    await userEvent.click(within(dialog).getByRole("button", { name: copy.customize.submit }));

    await waitFor(() =>
      expect(calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([
        { color: 3 },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("given a child with a Google photo, then the photo is offered and picking it saves that choice alone", async () => {
    const ines = {
      ...CONNECTED,
      color: 1,
      avatarUrl: "https://lh3.googleusercontent.com/a/ines",
      showsPhoto: false,
    };
    const calls = fakeApi({
      "GET /children": { body: [ines] },
      [`PATCH /children/${ines.id}`]: { body: { ...ines, showsPhoto: true } },
    });

    await renderApp("/children");
    await openMenu(ines.label);
    await userEvent.click(await screen.findByRole("menuitem", { name: copy.card.customize }));

    const dialog = await screen.findByRole("dialog", { name: copy.customize.title });
    expect(within(dialog).getByRole("radio", { name: copy.customize.initial })).toHaveProperty(
      "ariaChecked",
      "true",
    );
    await userEvent.click(within(dialog).getByRole("radio", { name: copy.customize.photo }));
    await userEvent.click(within(dialog).getByRole("button", { name: copy.customize.submit }));

    await waitFor(() =>
      expect(calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([
        { showsPhoto: true },
      ]),
    );
  });

  it("given a child without a Google photo, then only its initial is offered", async () => {
    fakeApi({ "GET /children": { body: [{ ...CONNECTED, color: 1, avatarUrl: null }] } });

    await renderApp("/children");
    await openMenu(CONNECTED.label);
    await userEvent.click(await screen.findByRole("menuitem", { name: copy.card.customize }));

    const dialog = await screen.findByRole("dialog", { name: copy.customize.title });
    expect(within(dialog).queryByRole("radio", { name: copy.customize.photo })).toBeNull();
  });

  it("given no child yet, then it invites to add one", async () => {
    fakeApi({ "GET /children": { body: [] } });

    await renderApp("/children");

    expect(await screen.findByText(copy.list.emptyTitle)).toBeTruthy();
  });
});
