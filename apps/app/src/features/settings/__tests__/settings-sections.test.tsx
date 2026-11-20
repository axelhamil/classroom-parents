// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";

describe("settings sections", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetApp();
    vi.restoreAllMocks();
  });

  it("given the privacy section, when the parent unfolds the details, then it states the Google Limited Use commitment and what Anthropic reads", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    await renderAppAt("/settings/privacy");

    expect(screen.queryByText(/Limited Use/)).toBeNull();
    await userEvent.setup().click(await screen.findByRole("button", { name: "En savoir plus" }));

    expect(await screen.findByText(/Limited Use/)).toBeTruthy();
    expect(screen.getByText(/Anthropic n'utilise pas ces données/)).toBeTruthy();
  });

  it("given the privacy section, when the parent exports their data, then the export is requested and downloaded", async () => {
    const calls = stubApi(
      byRoute({
        "GET /push/status": () => json({ live: 1 }),
        "POST /me/export": () =>
          new Response("{}", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": 'attachment; filename="keepupkids-data.json"',
            },
          }),
      }),
    );
    const files: Blob[] = [];
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, {
        createObjectURL: (blob: Blob) => {
          files.push(blob);
          return "blob:export";
        },
        revokeObjectURL: () => undefined,
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    await renderAppAt("/settings/privacy");

    await userEvent.setup().click(await screen.findByRole("button", { name: "Exporter" }));

    expect(await screen.findByText("Vos données sont téléchargées.")).toBeTruthy();
    expect(
      calls.filter(({ url }) => url.pathname === "/me/export").map(({ method }) => method),
    ).toEqual(["POST"]);
    expect(files).toHaveLength(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("given the help section, then it gives the address to write to", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    await renderAppAt("/settings/help");

    const contact = await screen.findByRole("link", { name: /contact@example\.com/ });
    expect(contact.getAttribute("href")).toBe("mailto:contact@example.com");
  });

  it("given the settings search, when the parent types « vacances » and picks the school calendar, then the region section opens on it", async () => {
    stubApi(byRoute({ "GET /push/status": () => json({ live: 1 }) }));
    const appRouter = await renderAppAt("/settings");

    fireEvent.change(await screen.findByRole("combobox", { name: "Rechercher un réglage" }), {
      target: { value: "vacances" },
    });
    await userEvent
      .setup()
      .click(await screen.findByRole("option", { name: /Calendrier scolaire/ }));

    await waitFor(() => expect(appRouter.state.location.pathname).toBe("/settings/region"));
    expect(appRouter.state.location.hash).toBe("school-calendar");
  });
});
