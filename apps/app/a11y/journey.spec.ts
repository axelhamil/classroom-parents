import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { z } from "zod";
import { JOURNEY_API_URL, JOURNEY_CONTROL_URL } from "./journey.config";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const STREAM_WAIT_MS = 30_000;
const SYNC_INTERVAL_MS = 30 * MINUTE_MS;
const SYNC_JITTER_MAX_MS = 3 * MINUTE_MS;
const EVERY_CHILD_DUE_MS = SYNC_INTERVAL_MS + SYNC_JITTER_MAX_MS + MINUTE_MS;
const GOOGLE = "https://accounts.google.com/**";

interface Identity {
  sub: string;
  email: string;
}

const run = randomUUID();
const PARENT: Identity = { sub: `parent-${run}`, email: `journey-${run}@example.com` };
const LEA: Identity = { sub: `lea-${run}`, email: "lea.demo@eleve.example" };
const HUGO: Identity = { sub: `hugo-${run}`, email: "hugo.demo@eleve.example" };

const Event = z.object({
  id: z.string(),
  childId: z.string(),
  title: z.string(),
  deadlineDate: z.string(),
  status: z.string(),
  source: z.string(),
});
const EventPage = z.object({ items: z.array(Event) });
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
const Push = z.object({ endpoint: z.string(), message: z.object({ title: z.string() }) });

function parisDate(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(at);
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

async function control(path: string, method = "POST"): Promise<unknown> {
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

async function pushesTitled(title: string): Promise<number> {
  const pushes = z.array(Push).parse(await control("/pushes", "GET"));
  return pushes.filter((push) => push.message.title === title).length;
}

function childCard(page: Page, child: Identity) {
  return page.locator("[data-slot=card]").filter({ hasText: child.email });
}

async function linkChild(page: Page, child: Identity): Promise<void> {
  await page.goto("/children/new");
  await googleAnswersAs(page, child);
  await page.getByRole("button", { name: "Ajouter le compte Google de mon enfant" }).click();

  await expect(page.getByText("Compte relié")).toBeVisible();
  await expect(page.getByText(/^Première échéance : /)).toBeVisible({ timeout: STREAM_WAIT_MS });
}

test("a parent links two children, follows their deadlines and alerts, then erases everything", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
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
      page.getByRole("heading", { level: 1, name: "Échéances", exact: true }),
    ).toBeVisible();
    userId = (await body(page, "/api/auth/get-session", Session)).user.id;
  });

  await test.step("links two children, their first deadline arrives without a reload", async () => {
    await linkChild(page, LEA);
    await linkChild(page, HUGO);

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
  if (!lea || !hugo || !alerted || !edited || !deleted)
    throw new Error("the fake Classroom dataset no longer offers the deadlines this journey needs");

  await test.step("filters by category, then opens a deadline", async () => {
    await page.goto("/");
    await page
      .getByRole("group", { name: "Filtrer par type" })
      .getByRole("button", { name: "Évaluation" })
      .click();

    await expect(page).toHaveURL(/category=assessment/);
    await expect(page.getByRole("link").filter({ hasText: /./ }).first()).toBeVisible();

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
        endpoint: `https://fcm.googleapis.com/fcm/send/journey-${run}`,
        keys: {
          p256dh: keys.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      }),
    });
    expect(subscribed).toMatchObject({ status: 204 });

    await control(`/alerts?at=${new Date(dueAt - MINUTE_MS).toISOString()}`);
    expect(await pushesTitled(alerted.title)).toBe(0);

    await control(`/alerts?at=${new Date(dueAt).toISOString()}`);
    expect(await pushesTitled(alerted.title)).toBe(1);
    await page.reload();
    await expect(page.getByText("Envoyé")).toBeVisible();
  });

  const editedTitle = `${edited.title} (déplacé)`;

  await test.step("edits a deadline into the past and deletes another", async () => {
    await page.goto(`/events/${edited.id}/edit`);
    await page.getByLabel("Titre").fill(editedTitle);
    await page.getByLabel("Pour le").fill(parisDate(startedAt - DAY_MS));
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: editedTitle })).toBeVisible();

    await page.goto(`/events/${deleted.id}`);
    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByText("Échéance supprimée")).toBeVisible();
  });

  await test.step("a resync neither resurrects the deleted deadline nor undoes the edit", async () => {
    const resync = await control(
      `/sync?at=${new Date(startedAt + EVERY_CHILD_DUE_MS).toISOString()}`,
    );

    expect(resync).toEqual({ children: 2, failures: 0 });

    expect(await api(page, `/events/${deleted.id}`)).toMatchObject({ status: 404 });
    expect((await body(page, `/events/${edited.id}`, Event)).title).toBe(editedTitle);
  });

  await test.step("history holds the deadline whose date has passed", async () => {
    await page.goto("/history");
    await expect(page.getByText(editedTitle)).toBeVisible();

    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Échéances", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(editedTitle)).toHaveCount(0);
  });

  await test.step("a school block comes back from the sync as a failure", async () => {
    await control("/schools/hugo/block");
    const blocked = await control(
      `/sync?at=${new Date(startedAt + 2 * EVERY_CHILD_DUE_MS).toISOString()}`,
    );

    expect(blocked).toEqual({ children: 2, failures: 1 });
  });

  await test.step("the parent sees what the school must do, then reconnects", async () => {
    await page.goto("/children");
    await expect(childCard(page, HUGO).getByText("Bloqué par l'école")).toBeVisible();
    await expect(page.getByText("Ce que l'école doit faire")).toBeVisible();

    await control("/schools/hugo/unblock");
    await googleAnswersAs(page, HUGO);
    await childCard(page, HUGO).getByRole("button", { name: "Reconnecter" }).click();
    await expect(childCard(page, HUGO).getByText("Relié")).toBeVisible();
  });

  await test.step("disconnecting a child removes its deadlines", async () => {
    await childCard(page, LEA).getByRole("button", { name: "Déconnecter" }).click();
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
