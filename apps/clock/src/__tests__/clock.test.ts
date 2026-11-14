import { describe, expect, it, mock } from "bun:test";
import { tick } from "../index";

const env = { API_URL: "https://api.example.org", CRON_SECRET: "clock-secret" };

describe("tick", () => {
  it("calls the api tick with the clock secret as a bearer", async () => {
    const send = mock(async (_url: URL, _init: RequestInit) => new Response("{}"));

    await tick(env, send);

    const [url, init] = send.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.example.org/internal/tick");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer clock-secret");
  });

  it("fails the invocation when the api answers a non-2xx, with its status and body", async () => {
    const send = mock(async () => new Response('{"ok":false}', { status: 500 }));

    await expect(tick(env, send)).rejects.toThrow('/internal/tick answered 500: {"ok":false}');
  });
});
