// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  byRoute,
  json,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
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

async function choose(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole("combobox", { name: label }), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

describe("language and AI reading cards", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
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

    expect(await screen.findByText(/Valeurs proposées par cet appareil/)).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Langue" }).textContent).toBe("Português");
    expect(screen.getByRole("combobox", { name: "Fuseau horaire" }).textContent).toBe(
      "America/Sao Paulo",
    );
    expect(screen.getByRole("combobox", { name: "Pays" }).textContent).toBe("Brésil");
  });

  it("given a parent who saves, then the language, time zone and country are sent", async () => {
    const calls = givenPreferences(NOTHING_CHOSEN);
    givenDevice(["fr-FR"], "Europe/Paris");
    await renderWithProviders(<LanguageAndRegionCard userId="user-1" />);

    await choose("Langue", "Español");
    await choose("Pays", "Belgique");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(
        calls.find((call) => call.url.pathname === "/assistant/preferences/language-and-region")
          ?.body,
      ).toEqual({ locale: "es", timeZone: "Europe/Paris", country: "BE" }),
    );
    expect(await screen.findByText("Langue et région enregistrées")).toBeDefined();
    expect(screen.queryByText(/Valeurs proposées par cet appareil/)).toBeNull();
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
});
