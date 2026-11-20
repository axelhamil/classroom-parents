import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { shiftDate } from "@packages/ddd-kit/days";
import type { Page } from "@playwright/test";
import { z } from "zod";
import { lateWindow } from "../src/shared/agenda/windows";
import { expect, test } from "./csp";
import { JOURNEY_API_URL, JOURNEY_CONTROL_URL } from "./journey.config";
import { TOUR_SELECTOR } from "./tour";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const STREAM_WAIT_MS = 30_000;
const RESYNC_STEP_MS = 15 * MINUTE_MS;
const GOOGLE = "https://accounts.google.com/**";

interface Identity {
  sub: string;
  email: string;
}

const run = randomUUID();
const PARENT: Identity = { sub: `parent-${run}`, email: `journey-${run}@example.com` };
const LEA: Identity = { sub: `lea-${run}`, email: "lea.demo@eleve.example" };
const HUGO: Identity = { sub: `hugo-${run}`, email: "hugo.demo@eleve.example" };
const PUSH_ENDPOINT = `https://fcm.googleapis.com/fcm/send/journey-${run}`;

const Event = z.object({
  id: z.string(),
  childId: z.string(),
  title: z.string(),
  deadlineDate: z.string(),
  status: z.string(),
  source: z.string(),
});
const EventPage = z.object({ items: z.array(Event) });
const CalendarDeadlines = z.object({
  items: z.array(z.object({ deadlineDate: z.string(), done: z.boolean() })),
});
const Child = z.object({ id: z.string(), label: z.string(), googleEmail: z.string() });
const Reminders = z.object({
  reminders: z.array(
    z.object({
      reminder: z.object({
        kind: z.string(),
        days: z.number().optional(),
        time: z.string().optional(),
      }),
      dueAt: z.string().nullable(),
      status: z.string(),
    }),
  ),
});
const Session = z.object({ user: z.object({ id: z.string() }) });
const Push = z.object({
  endpoint: z.string(),
  message: z.object({ title: z.string(), body: z.string() }),
});

function parisDate(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(at);
}

function lateLabel(count: number): string {
  return count === 0 ? "En retard" : `En retard, ${count} échéance${count > 1 ? "s" : ""}`;
}

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

async function pickDate(page: Page, date: string, shown: string): Promise<void> {
  const name = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.parse(`${date}T00:00:00Z`));
  const steps = monthIndex(date) - monthIndex(shown);

  await page.getByLabel("Pour le").click();
  for (let step = 0; step < Math.abs(steps); step += 1)
    await page
      .getByRole("button", {
        name: steps < 0 ? "Aller au mois précédent" : "Aller au mois suivant",
      })
      .click();
  await page.getByRole("button", { name: new RegExp(`(^|, )${name}`) }).click();
}

async function googleAnswersAs(page: Page, identity: Identity): Promise<void> {
  await page.unroute(GOOGLE);
  await page.route(GOOGLE, (route) => {
    const consent = new URL(route.request().url());
    const callback = new URL(consent.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("state", consent.searchParams.get("state") ?? "");
    callback.searchParams.set("code", `${identity.sub}|${identity.email}`);
    return route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
}

const appSyncs: Promise<unknown>[] = [];

// Playwright itself sends the sync each page load asks for, so its wait ends with the api's
// answer: the response() of a request whose page navigated away while the answer was on its
// way never settles, and every later control call would wait for it until the test times out.
async function trackAppSyncs(page: Page): Promise<void> {
  await page.route(`${JOURNEY_API_URL}/sync`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();

    const answered = route.fetch();
    appSyncs.push(answered.catch(() => null));
    try {
      await route.fulfill({ response: await answered });
    } catch {
      await route.abort().catch(() => undefined);
    }
  });
}

async function control(path: string, method = "POST"): Promise<unknown> {
  await Promise.all(appSyncs);
  const response = await fetch(`${JOURNEY_CONTROL_URL}${path}`, { method });
  expect(response.ok, `${method} ${path}`).toBe(true);

  return response.status === 204 ? null : response.json();
}

interface Call {
  method: string;
  headers: Record<string, string>;
  body: string;
}

async function api(page: Page, path: string, init?: Call): Promise<unknown> {
  return page.evaluate(
    async ({ url, init }) => {
      const response = await fetch(url, { credentials: "include", ...init });
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
    { url: `${JOURNEY_API_URL}${path}`, init },
  );
}

async function body<T>(page: Page, path: string, schema: z.ZodType<T>): Promise<T> {
  const reply = z
    .object({ status: z.literal(200), body: z.unknown() })
    .parse(await api(page, path));
  return schema.parse(reply.body);
}

async function journeyPushes(): Promise<z.infer<typeof Push>[]> {
  const pushes = z.array(Push).parse(await control("/pushes", "GET"));
  return pushes.filter((push) => push.endpoint === PUSH_ENDPOINT);
}

function childCard(page: Page, child: Identity) {
  return page.locator("[data-slot=card]").filter({ hasText: child.email });
}

async function connectAndName(page: Page, child: Identity): Promise<void> {
  await page.getByRole("button", { name: "J'ai tout, continuer" }).click();
  await googleAnswersAs(page, child);
  await page.getByRole("button", { name: "Ajouter le compte Google de mon enfant" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Comment s'appelle votre enfant ?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByText(/^Voici ce qui arrive pour /)).toBeVisible({
    timeout: STREAM_WAIT_MS,
  });
}

async function onboardFirstChild(page: Page, child: Identity): Promise<void> {
  await page.getByRole("button", { name: "Commencer" }).click();
  await connectAndName(page, child);

  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByRole("button", { name: "Garder les rappels actuels" }).click();
  await page.getByRole("button", { name: "Plus tard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "C'est prêt" })).toBeVisible();
}

async function linkAnotherChild(page: Page, child: Identity): Promise<void> {
  await page.goto("/children/new");
  await connectAndName(page, child);
}

test("a parent links two children, follows their deadlines and alerts, then erases everything", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await trackAppSyncs(page);
  await page.addLocatorHandler(page.locator(TOUR_SELECTOR), (tour) =>
    tour.getByRole("button", { name: "Passer" }).click(),
  );
  const startedAt = Date.now();
  let userId = "";

  await test.step("starts from a database without any earlier journey parent", async () => {
    expect(await control("/reset")).toMatchObject({ parents: expect.any(Number) });
  });

  await test.step("signs in with Google", async () => {
    await page.goto("/login");
    await googleAnswersAs(page, PARENT);
    await page.getByRole("button", { name: "Continuer avec Google" }).first().click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Ne ratez plus aucune échéance scolaire" }),
    ).toBeVisible();
    userId = (await body(page, "/api/auth/get-session", Session)).user.id;
  });

  await test.step("links two children, their first deadlines arrive without a reload", async () => {
    await onboardFirstChild(page, LEA);
    await linkAnotherChild(page, HUGO);

    const children = await body(page, "/children", z.array(Child));
    expect(children.map((child) => child.googleEmail).sort()).toEqual([HUGO.email, LEA.email]);
  });

  const upcoming = (await body(page, "/events?limit=50", EventPage)).items;
  const children = await body(page, "/children", z.array(Child));
  const lea = children.find((child) => child.googleEmail === LEA.email);
  const hugo = children.find((child) => child.googleEmail === HUGO.email);
  const farEnough = parisDate(startedAt + 5 * DAY_MS);
  const alerted = upcoming.find(
    (event) => event.status === "confirmed" && event.deadlineDate >= farEnough,
  );
  const past = (await body(page, "/events?scope=history&limit=50", EventPage)).items;
  const [edited, deleted] = [...upcoming, ...past].filter(
    (event) => event.source === "coursework" && event.id !== alerted?.id,
  );
  const alertedChild = children.find((child) => child.id === alerted?.childId);
  if (!lea || !hugo || !alerted || !alertedChild || !edited || !deleted)
    throw new Error("the fake Classroom dataset no longer offers the deadlines this journey needs");

  await test.step("finds a deadline on its day of the calendar, then opens it", async () => {
    await page.goto(`/?view=week&date=${alerted.deadlineDate}`);
    const row = page.getByRole("link").filter({ hasText: alerted.title }).first();
    await expect(row).toBeVisible();

    await page.goto(`/events/${alerted.id}`);
    await expect(page.getByRole("heading", { level: 1, name: alerted.title })).toBeVisible();
  });

  await test.step("sets its own alert, delivered to the push sink at the chosen time", async () => {
    await page.getByRole("button", { name: "Modifier les rappels" }).click();
    const first = page.getByRole("group", { name: "Rappel 1" });
    await first.getByLabel("Jours avant").fill("3");
    await first.getByLabel("Heure").fill("07:30");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Rappels enregistrés")).toBeVisible();

    const { reminders } = await body(page, `/events/${alerted.id}/reminders`, Reminders);
    const [planned] = reminders;
    expect(reminders).toHaveLength(1);
    expect(planned?.reminder).toEqual({ kind: "days_before", days: 3, time: "07:30" });
    const dueAt = new Date(planned?.dueAt ?? Number.NaN).getTime();

    const keys = createECDH("prime256v1");
    keys.generateKeys();
    const subscribed = await api(page, "/push/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: PUSH_ENDPOINT,
        keys: {
          p256dh: keys.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      }),
    });
    expect(subscribed).toMatchObject({ status: 204 });

    await control(`/alerts?at=${new Date(dueAt - MINUTE_MS).toISOString()}`);
    expect(await journeyPushes()).toHaveLength(0);

    await control(`/alerts?at=${new Date(dueAt).toISOString()}`);
    const [pushed, ...more] = await journeyPushes();
    expect(more).toHaveLength(0);
    const lockScreen = `${pushed?.message.title}\n${pushed?.message.body}`;
    expect(lockScreen).toContain("KeepUpKids");
    expect(lockScreen).not.toContain(alerted.title);
    expect(lockScreen).not.toContain(alertedChild.label);
    await page.reload();
    await expect(page.getByText("Envoyé")).toBeVisible();
  });

  const editedTitle = `${edited.title} (déplacé)`;

  await test.step("edits a deadline into the past and deletes another", async () => {
    await page.goto(`/events/${edited.id}/edit`);
    await page.getByLabel("Titre").fill(editedTitle);
    await pickDate(page, parisDate(startedAt - DAY_MS), edited.deadlineDate);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: editedTitle })).toBeVisible();

    await page.goto(`/events/${deleted.id}`);
    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Échéance supprimée")).toBeVisible();
  });

  await test.step("a resync neither resurrects the deleted deadline nor undoes the edit", async () => {
    const resync = await control(`/sync?at=${new Date(startedAt + RESYNC_STEP_MS).toISOString()}`);

    expect(resync).toEqual({ children: 2, failures: 0 });

    expect(await api(page, `/events/${deleted.id}`)).toMatchObject({ status: 404 });
    expect((await body(page, `/events/${edited.id}`, Event)).title).toBe(editedTitle);
  });

  await test.step("history holds the passed deadline, ticked from the overdue block, which counts one less", async () => {
    await page.goto("/?tab=history");
    await expect(page.getByText(editedTitle)).toBeVisible();

    // The home first paints the agenda restored from the offline cache: the count to wait for is the server's.
    const today = parisDate(Date.now());
    const lateFrom = shiftDate(today, -lateWindow.days);
    const lateRange = `from=${lateFrom}&to=${shiftDate(today, -1)}`;
    const { items } = await body(page, `/events/calendar?${lateRange}`, CalendarDeadlines);
    const before = items.filter((event) => !event.done).length;
    await page.goto("/");
    await expect(page.getByRole("tablist", { name: "Vue des échéances" })).toBeVisible();
    const late = page.getByRole("region", { name: /^En retard/ });
    await expect(late).toHaveAccessibleName(lateLabel(before));
    await expect(late.getByRole("link", { name: editedTitle })).toBeVisible();
    await expect(page.getByText(editedTitle)).toHaveCount(1);

    await late.getByRole("checkbox", { name: `Marquer comme fait : ${editedTitle}` }).click();
    await expect(late).toHaveAccessibleName(lateLabel(before - 1));
    await expect(late.getByRole("link", { name: editedTitle })).toHaveCount(0);
  });

  await test.step("a school block comes back from the sync as a failure", async () => {
    await control("/schools/hugo/block");
    const blocked = await control(
      `/sync?at=${new Date(startedAt + 2 * RESYNC_STEP_MS).toISOString()}`,
    );

    expect(blocked).toEqual({ children: 2, failures: 1 });
  });

  await test.step("the parent prepares the request for the school, then reconnects", async () => {
    await page.goto("/children");
    await expect(childCard(page, HUGO).getByText("Bloqué par l'école")).toBeVisible();
    await childCard(page, HUGO)
      .getByRole("link", { name: "Préparer la demande à l'école" })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/aide/ecole");
    await expect(
      page.getByRole("heading", { level: 1, name: "Faire autoriser l'application par l'école" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message à envoyer" })).toHaveValue(
      /ID client OAuth : \S+/,
    );
    await page.getByRole("link", { name: "Voir mes enfants" }).click();

    await control("/schools/hugo/unblock");
    await googleAnswersAs(page, HUGO);
    await childCard(page, HUGO).getByRole("button", { name: "Reconnecter" }).click();
    await expect(childCard(page, HUGO).getByText("Relié")).toBeVisible();
  });

  await test.step("disconnecting a child removes its deadlines", async () => {
    await childCard(page, LEA)
      .getByRole("button", { name: /^Actions pour / })
      .click();
    await page.getByRole("menuitem", { name: "Déconnecter" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Déconnecter" }).click();

    await expect(childCard(page, LEA)).toHaveCount(0, { timeout: STREAM_WAIT_MS });
    const remaining = (await body(page, "/events?limit=50", EventPage)).items;
    expect(remaining.filter((event) => event.childId === lea.id)).toEqual([]);
    expect(remaining.some((event) => event.childId === hugo.id)).toBe(true);
  });

  await test.step("deleting the account leaves no row behind once the grace period ends", async () => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await page.getByRole("button", { name: "Oui, supprimer mon compte" }).click();
    await expect(page.getByRole("heading", { name: "Suppression programmée" })).toBeVisible();

    await control(`/wipe?userId=${userId}&at=${new Date(startedAt + 8 * DAY_MS).toISOString()}`);

    await expect
      .poll(async () =>
        control(`/leftovers?userId=${userId}&email=${encodeURIComponent(PARENT.email)}`, "GET"),
      )
      .toEqual({
        users: 0,
        accounts: 0,
        sessions: 0,
        children: 0,
        events: 0,
        alerts: 0,
        defaultReminders: 0,
        eventReminders: 0,
        pushSubscriptions: 0,
        emails: 0,
        outboxWithEmail: 0,
      });
  });

  expect(browserErrors).toEqual([]);
});
