const VISIT_DAYS_KEY = "keepupkids:visit-days";
const DISMISSED_AT_KEY = "keepupkids:install-invite-dismissed-at";
const DAYS_BEFORE_INVITE = 2;
const REOFFER_AFTER_MS = 30 * 24 * 60 * 60_000;

function visitDaysOf(storage: Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(VISIT_DAYS_KEY) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter((day) => typeof day === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers that the app was opened on `day`, keeping only as many days as the invite needs. */
export function recordVisitDay(day: string, storage: Storage = localStorage): void {
  const days = visitDaysOf(storage);
  if (days.includes(day)) return;

  storage.setItem(VISIT_DAYS_KEY, JSON.stringify([...days, day].slice(-DAYS_BEFORE_INVITE)));
}

/**
 * The invite comes back on a second day of use, once the parent has seen the app is worth
 * keeping, and stays away for a month after a "later".
 */
export function installInviteDue(now: Date, storage: Storage = localStorage): boolean {
  const dismissedAt = Number(storage.getItem(DISMISSED_AT_KEY));
  const dismissedRecently = dismissedAt > 0 && now.getTime() - dismissedAt < REOFFER_AFTER_MS;

  return !dismissedRecently && visitDaysOf(storage).length >= DAYS_BEFORE_INVITE;
}

export function dismissInstallInvite(now: Date, storage: Storage = localStorage): void {
  storage.setItem(DISMISSED_AT_KEY, String(now.getTime()));
}
