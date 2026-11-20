// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byRoute,
  json,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import {
  ensurePointerCapture,
  ensureResizeObserver,
  ensureScrollIntoView,
} from "../../../__tests__/match-media";
import { AiReadingCard } from "../components/ai-reading-card";
import { LanguageAndRegionCard } from "../components/language-and-region-card";

const NOTHING_CHOSEN = { locale: null, timeZone: null, country: null, extractionEnabled: true };

function givenPreferences(stored: typeof NOTHING_CHOSEN) {
  return stubApi(
    byRoute({
      "GET /assistant/preferences": () => json(stored),
      "PUT /assistant/preferences/language-and-region": ({ body }) =>
        json({ ...stored, ...(body as object) }),
      "PUT /assistant/preferences/extraction": ({ body }) =>
        json({ ...stored, extractionEnabled: (body as { enabled: boolean }).enabled }),
    }),
  );
}

function givenDevice(languages: readonly string[], timeZone: string) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "fr");
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...resolvedOptions.call(this), timeZone };
  });
}

/**
 * Opens a select and picks an option by its text: the time zone and country lists hold hundreds of
 * options, and an accessible-name lookup over each of them made this test slow enough to time out
 * under a loaded CI.
 */
async function choose(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole("combobox", { name: label }), { key: "Enter" });
  const text = await within(await screen.findByRole("listbox")).findByText(option);
  const item = text.closest<HTMLElement>("[role=option]");
  if (!item) throw new Error(`${option} is not an option of ${label}`);

  fireEvent.keyDown(item, { key: "Enter" });
}

function savedLanguageAndRegion(calls: ReturnType<typeof givenPreferences>) {
  return calls
    .filter(({ url }) => url.pathname === "/assistant/preferences/language-and-region")
    .map(({ body }) => body);
}

describe("language and AI reading cards", () => {
  beforeEach(() => {
    ensureResizeObserver();
    ensurePointerCapture();
    ensureScrollIntoView();
  });

  afterEach(() => {
    cleanup();
    resetApp();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("given a parent who never chose, then the device language, time zone and country are proposed", async () => {
    givenPreferences(NOTHING_CHOSEN);
    givenDevice(["de-DE", "pt-BR"], "America/Sao_Paulo");
    await renderWithProviders(<LanguageAndRegionCard userId="user-1" />);

    expect(await screen.findByText("Proposés par cet appareil")).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Langue" }).textContent).toBe("Português");
    expect(screen.getByRole("combobox", { name: "Fuseau horaire" }).textContent).toBe(
      "America/Sao Paulo",
    );
    expect(screen.getByRole("combobox", { name: "Pays" }).textContent).toBe("Brésil");
  });

  it("given a parent who keeps the device values, then the language, time zone and country are sent", async () => {
    const calls = givenPreferences(NOTHING_CHOSEN);
    givenDevice(["fr-BE"], "Europe/Brussels");
    await renderWithProviders(<LanguageAndRegionCard userId="user-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Garder" }));

    await waitFor(() =>
      expect(savedLanguageAndRegion(calls)).toEqual([
        { locale: "fr", timeZone: "Europe/Brussels", country: "BE" },
      ]),
    );
    await waitFor(() => expect(screen.queryByText("Proposés par cet appareil")).toBeNull());
  });

  it("given a parent who picks another language, then it is saved at once with the rest of the region", async () => {
    const calls = givenPreferences(NOTHING_CHOSEN);
    givenDevice(["fr-FR"], "Europe/Paris");
    await renderWithProviders(<LanguageAndRegionCard userId="user-1" />);

    await choose("Langue", "Español");

    await waitFor(() =>
      expect(savedLanguageAndRegion(calls)).toEqual([
        { locale: "es", timeZone: "Europe/Paris", country: "FR" },
      ]),
    );
    expect(await screen.findByText("Enregistré")).toBeDefined();
  });

  it("given AI reading is on, when the parent turns it off, then it is saved at once and only Classroom work is read", async () => {
    const calls = givenPreferences(NOTHING_CHOSEN);
    await renderWithProviders(<AiReadingCard userId="user-1" />);

    const reading = await screen.findByRole("switch", { name: "Lecture des annonces par l'IA" });
    expect(reading.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(reading);

    await waitFor(() =>
      expect(
        calls.find((call) => call.url.pathname === "/assistant/preferences/extraction")?.body,
      ).toEqual({ enabled: false }),
    );
    expect(await screen.findByText(/Seuls les devoirs Classroom restent lus/)).toBeDefined();
  });

  it("given AI reading is paused, when the parent turns it back on, then the card says the paused announcements will be read", async () => {
    givenPreferences({ ...NOTHING_CHOSEN, extractionEnabled: false });
    await renderWithProviders(<AiReadingCard userId="user-1" />);

    const reading = await screen.findByRole("switch", { name: "Lecture des annonces par l'IA" });
    expect(screen.queryByText("Les annonces reçues pendant la pause vont être lues.")).toBeNull();
    fireEvent.click(reading);

    const status = await screen.findByText("Les annonces reçues pendant la pause vont être lues.");
    expect(status.getAttribute("role")).toBe("status");

    fireEvent.click(reading);
    await waitFor(() =>
      expect(screen.queryByText("Les annonces reçues pendant la pause vont être lues.")).toBeNull(),
    );
  });
});
