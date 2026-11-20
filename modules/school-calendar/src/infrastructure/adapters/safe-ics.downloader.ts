import { lookup } from "node:dns/promises";
import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { instrumentedFetch } from "@packages/http/instrumented-fetch";
import { isPublicAddress } from "@packages/http/private-ranges";
import {
  icsInvalid,
  icsUnreachable,
  icsUrlInvalid,
  type SchoolCalendarError,
} from "../../application/errors/school-calendar-errors";
import type { IIcsDownloader } from "../../application/ports/ics-downloader.port";
import { ICS_MAX_CHARACTERS } from "../../domain/calendar/ics-periods";

const TIMEOUT_MS = 5_000;
const MAX_BYTES = ICS_MAX_CHARACTERS;

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

export type ResolveHost = (hostname: string) => Promise<string[]>;

const resolveWithDns: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

function unbracketed(hostname: string): string {
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

/**
 * Downloads a calendar a parent pointed to, as text and nothing more: https on the default port,
 * no credentials in the URL, every resolved address public, no redirect followed, 5 s and 512 KB
 * at most. The address check runs before the request; a host that answers public then private
 * between the two (DNS rebinding) is the remaining gap, narrowed by the absence of redirects.
 */
export class SafeIcsDownloader implements IIcsDownloader {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly fetchImpl: typeof fetch,
    private readonly resolve: ResolveHost = resolveWithDns,
  ) {}

  download(url: string): Outcome<string> {
    return this.instrumentation.startSpan({ name: "SafeIcsDownloader > download" }, async () => {
      const target = await this.allowedTarget(url);
      if (target.isFailure) return Result.fail(target.getError());

      try {
        return await this.fetchText(target.getValue());
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(icsUnreachable("request failed"));
      }
    });
  }

  private async allowedTarget(raw: string): Outcome<URL> {
    const url = URL.canParse(raw) ? new URL(raw) : null;
    if (url?.protocol !== "https:") return Result.fail(icsUrlInvalid("not an https URL"));
    if (url.username || url.password || url.port)
      return Result.fail(icsUrlInvalid("not a plain URL"));

    const addresses = await this.resolve(unbracketed(url.hostname)).catch(() => []);
    if (addresses.length === 0 || !addresses.every(isPublicAddress))
      return Result.fail(icsUrlInvalid("not a public host"));

    return Result.ok(url);
  }

  private async fetchText(url: URL): Outcome<string> {
    const response = await instrumentedFetch(this.instrumentation, this.fetchImpl, url.href, {
      method: "GET",
      headers: { accept: "text/calendar, text/plain;q=0.5" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return Result.fail(icsUnreachable(`answered ${response.status}`));

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return Result.fail(icsInvalid("the file is too large"));

    return this.readCapped(response);
  }

  private async readCapped(response: Response): Outcome<string> {
    const reader = response.body?.getReader();
    if (!reader) return Result.fail(icsInvalid("empty answer"));

    const chunks: Uint8Array[] = [];
    let size = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return Result.fail(icsInvalid("the file is too large"));
      }
      chunks.push(chunk.value);
    }

    return Result.ok(new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)));
  }
}
