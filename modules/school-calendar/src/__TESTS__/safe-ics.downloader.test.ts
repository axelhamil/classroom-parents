import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { SafeIcsDownloader } from "../infrastructure/adapters/safe-ics.downloader";

const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";

function fetchAnswering(response: () => Response) {
  return Object.assign(
    mock(async (_url: string | URL | Request, _init?: RequestInit) => response()),
    { preconnect: fetch.preconnect },
  );
}

function downloader(addresses: string[], response = () => new Response(ICS)) {
  const fetchImpl = fetchAnswering(response);
  const resolve = async () => addresses;

  return { fetchImpl, ics: new SafeIcsDownloader(mockInstrumentation(), fetchImpl, resolve) };
}

describe("downloading the calendar a parent pointed to", () => {
  it("given a public https link, then the file is read without following redirects", async () => {
    const { ics, fetchImpl } = downloader(["93.184.215.14"]);

    const result = await ics.download("https://school.example/calendar.ics");

    expect(result.getValue()).toBe(ICS);
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it.each([
    ["an http link", "http://school.example/calendar.ics", ["93.184.215.14"]],
    [
      "a link with credentials",
      "https://user:secret@school.example/calendar.ics",
      ["93.184.215.14"],
    ],
    ["a link with a port", "https://school.example:8443/calendar.ics", ["93.184.215.14"]],
    [
      "a host resolving to the cloud metadata address",
      "https://school.example/c.ics",
      ["169.254.169.254"],
    ],
    [
      "a host with one private address among public ones",
      "https://school.example/c.ics",
      ["93.184.215.14", "10.0.0.5"],
    ],
    ["a host that does not resolve", "https://school.example/c.ics", []],
  ])("given %s, then nothing is requested", async (_, url, addresses) => {
    const { ics, fetchImpl } = downloader(addresses);

    const result = await ics.download(url);

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_ICS_URL_INVALID");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("given a file larger than 512 KB, then the read stops and the file is refused", async () => {
    const { ics } = downloader(["93.184.215.14"], () => new Response("X".repeat(600 * 1024)));

    const result = await ics.download("https://school.example/calendar.ics");

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_ICS_INVALID");
  });

  it("given the school site answers an error, then the download fails as a provider failure", async () => {
    const { ics } = downloader(["93.184.215.14"], () => new Response("nope", { status: 404 }));

    const result = await ics.download("https://school.example/calendar.ics");

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_ICS_PROVIDER_FAILURE");
  });
});
