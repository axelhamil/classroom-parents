// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { byRoute, json, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import { queryClient } from "../../../shared/api/query-client";
import { DigestCard } from "../components/digest-card";

describe("DigestCard", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("given the sunday digest is on, when the parent turns it off, then it is saved at once and the card says reminders still arrive", async () => {
    const calls = stubApi(
      byRoute({
        "GET /reminders/digest": () => json({ enabled: true }),
        "PUT /reminders/digest": ({ body }) => json(body),
      }),
    );
    await renderWithProviders(<DigestCard userId="user-1" />);

    const digest = await screen.findByRole("switch", { name: "Recevoir le résumé du dimanche" });
    expect(digest.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(digest);

    await waitFor(() =>
      expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ enabled: false }),
    );
    expect(await screen.findByText(/Les rappels de chaque échéance continuent/)).toBeTruthy();
  });
});
