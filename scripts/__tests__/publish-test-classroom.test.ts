import { describe, expect, it } from "bun:test";
import { announcementsToPublish, parseDataset, readConfig } from "../publish-test-classroom";

const CREDENTIALS = {
  TEST_CLASSROOM_CLIENT_ID: "client",
  TEST_CLASSROOM_CLIENT_SECRET: "secret",
  TEST_CLASSROOM_REFRESH_TOKEN: "refresh",
};

describe("publish-test-classroom", () => {
  it("refuses to run without the explicit test credentials, naming each missing one", () => {
    const result = readConfig({ TEST_CLASSROOM_CLIENT_ID: "client" });

    expect(result).toEqual({
      ok: false,
      missing: ["TEST_CLASSROOM_CLIENT_SECRET", "TEST_CLASSROOM_REFRESH_TOKEN"],
    });
  });

  it("runs once every test credential is set", () => {
    expect(readConfig(CREDENTIALS).ok).toBe(true);
  });

  it("publishes only the synthetic announcements the course does not show yet", () => {
    const dataset = parseDataset(
      [
        '{"id":"a","text":"Contrôle jeudi prochain.","expected":[]}',
        "",
        '{"id":"b","text":"Piscine lundi.","expected":[]}',
      ].join("\n"),
    );

    const pending = announcementsToPublish(dataset, ["  Contrôle   jeudi prochain.\n"]);

    expect(pending.map((announcement) => announcement.id)).toEqual(["b"]);
  });

  it("refuses a dataset line without text instead of publishing an empty announcement", () => {
    expect(() => parseDataset('{"id":"a"}')).toThrow("dataset line 1");
  });
});
