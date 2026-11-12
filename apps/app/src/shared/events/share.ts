export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export interface SharedText {
  title: string;
  text: string;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function shareOrCopy(payload: SharedText): Promise<ShareOutcome> {
  if (typeof navigator.share === "function" && navigator.canShare?.(payload) !== false) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(`${payload.title}\n${payload.text}`);
    return "copied";
  } catch {
    return "failed";
  }
}
