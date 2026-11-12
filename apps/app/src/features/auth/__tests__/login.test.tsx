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

describe("the landing on the home address", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
  });
  afterEach(resetApp);

  it("given a signed out visitor on the home address, then the landing shows and its button starts the Google flow", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });

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

  it("given a signed in parent on the home address, then the landing is not shown", async () => {
    fakeApi({});
    await renderApp("/");

    await screen.findByRole("main");

    expect(screen.queryByRole("heading", { name: landing.headline })).toBeNull();
  });

  it("given a parent lands on the page, then the first screen holds the promise, one action and the read-only line, nothing else to choose from", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });

    const hero = within(await firstScreen());

    expect(hero.getAllByRole("button").map((button) => button.textContent)).toEqual([copy.google]);
    expect(hero.getByText(landing.readOnly).textContent).toMatch(/n'écrit jamais dans Classroom/);
    expect(hero.queryAllByRole("heading")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("given a parent lands on the page, then the first screen shows a sample week and the alert it sends, out of reach of the keyboard", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });

    const sample = within(await firstScreen()).getByRole("figure");

    expect(within(sample).getByText(landing.sample.fractions)).toBeTruthy();
    expect(within(sample).getByText(landing.sample.notification.title)).toBeTruthy();
    expect(sample.querySelectorAll("a:not([inert] a), button:not([inert] button)")).toHaveLength(0);
  });

  it("given the parent scrolls, then 3 proof points and the questions are all that is left to read", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });

    const proofs = landing.proofs;
    const title = await screen.findByRole("heading", { level: 2, name: proofs.title });
    const list = within(title.closest("section") ?? document.body).getByRole("list");

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([proofs.family, proofs.alerts, proofs.readOnly]);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([proofs.title, landing.faq.title, landing.closing.title]);
  });

  it("given the parent reached the end of the landing, then its last button also starts the Google flow", async () => {
    fakeApi({});
    await renderApp("/", { signedIn: false });
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

describe("the sign in page", () => {
  beforeEach(() => {
    vi.mocked(authClient.signIn.social).mockClear();
  });
  afterEach(resetApp);

  it("given a parent sent to sign in from a page, when they continue with Google, then they come back to that page", async () => {
    fakeApi({});
    await renderApp("/login?redirect=%2Fhistory", { signedIn: false });

    await screen.findByRole("heading", { level: 1, name: copy.title });
    await userEvent.click(screen.getByRole("button", { name: copy.google }));

    await waitFor(() =>
      expect(authClient.signIn.social).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          callbackURL: `${window.location.origin}/history`,
          errorCallbackURL: `${window.location.origin}/login?redirect=%2Fhistory`,
        }),
      ),
    );
  });

  it("given the sign in page, then it holds one button, the read-only line and the way to the landing, and stays out of search results", async () => {
    fakeApi({});
    await renderApp("/login", { signedIn: false });

    await screen.findByRole("heading", { level: 1, name: copy.title });

    expect(screen.getAllByRole("button", { name: copy.google })).toHaveLength(1);
    expect(screen.getByText(landing.readOnly)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.discover }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("figure")).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
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
});
