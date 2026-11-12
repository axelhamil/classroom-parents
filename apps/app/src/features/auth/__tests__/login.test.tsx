// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { frCatalog } from "@packages/i18n";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeApi, renderApp, resetApp } from "../../../__tests__/render-app";
import { authClient } from "../../../shared/auth/auth-client";

vi.mock("../../../shared/auth/auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
    signIn: { social: vi.fn(async () => ({ data: { url: "https://accounts.google.com" } })) },
  },
}));

const copy = frCatalog.auth.login;
const landing = frCatalog.auth.landing;

const StructuredData = z.object({
  "@graph": z.array(
    z.object({
      "@type": z.string(),
      mainEntity: z
        .array(z.object({ name: z.string(), acceptedAnswer: z.object({ text: z.string() }) }))
        .optional(),
    }),
  ),
});

async function firstScreen(): Promise<HTMLElement> {
  const headline = await screen.findByRole("heading", { level: 1, name: landing.headline });
  const hero = headline.closest("section");
  if (!hero) throw new Error("the headline sits outside the first screen section");

  return hero;
}

describe("signing in with Google", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(resetApp);

  it("given the parent starts the Google sign in, then a refusal comes back to the app login page", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    await userEvent.click(within(await firstScreen()).getByRole("button", { name: copy.google }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          errorCallbackURL: `${window.location.origin}/login`,
        }),
      ),
    );
  });

  it("given a parent lands on the page, then the first screen holds the promise, one action and the read-only line, nothing else to choose from", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    const hero = within(await firstScreen());

    expect(hero.getAllByRole("button").map((button) => button.textContent)).toEqual([copy.google]);
    expect(hero.getByText(landing.readOnly).textContent).toMatch(/n'écrit jamais dans Classroom/);
    expect(hero.queryAllByRole("link")).toEqual([]);
    expect(hero.queryAllByRole("heading")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("given the parent scrolls, then the 3 steps come in order with what the application never does", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    const steps = landing.steps;
    const howItWorks = await screen.findByRole("heading", { level: 2, name: steps.title });
    const list = within(howItWorks.closest("section") ?? document.body).getByRole("list");

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => within(item).getByRole("heading").textContent),
    ).toEqual([steps.signIn.title, steps.addChild.title, steps.alerts.title]);
    expect(screen.getByRole("heading", { level: 2, name: landing.never.title })).toBeTruthy();
  });

  it("given the parent reached the end of the landing, then its last button also starts the Google flow", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });
    await firstScreen();

    const closing = screen.getAllByRole("button", { name: copy.google }).at(-1);
    if (!closing) throw new Error("no closing sign in button");
    await userEvent.click(closing);

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google" }),
      ),
    );
  });

  it("given the parent cancelled on Google, then the login page says so in French", async () => {
    fakeApi({});
    await renderApp("/login?error=access_denied", { signedIn: false });

    expect((await screen.findByRole("alert")).textContent).toBe(copy.cancelled);
  });

  it("given another Google callback error, then the login page asks to try again", async () => {
    fakeApi({});
    await renderApp("/login?error=state_mismatch", { signedIn: false });

    expect((await screen.findByRole("alert")).textContent).toBe(copy.callbackFailed);
  });

  it("the questions declared to search engines are the ones the page shows", () => {
    const html = readFileSync("index.html", "utf8");
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    const { "@graph": graph } = StructuredData.parse(JSON.parse(json ?? "{}"));
    const declared = graph.find((node) => node["@type"] === "FAQPage")?.mainEntity ?? [];
    const { blocked, data, deletion } = landing.faq;

    expect(declared.map((entry) => [entry.name, entry.acceptedAnswer.text])).toEqual(
      [blocked, data, deletion].map((entry) => [entry.question, entry.answer]),
    );
  });
});
