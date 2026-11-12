const CALENDAR_FEED_PATH = /\/calendar\/[^/?#\s]+/g;

export function redactSecretPath(text: string): string {
  return text.replace(CALENDAR_FEED_PATH, "/calendar/[secret]");
}
