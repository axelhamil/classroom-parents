// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

function givenServiceWorker(): EventTarget {
  const container = new EventTarget();
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: container,
  });
  return container;
}

function messageFromWorker(container: EventTarget, data: unknown) {
  const reply = { postMessage: vi.fn() };
  const event = Object.assign(new Event("message"), { data, ports: [reply] });
  container.dispatchEvent(event);
  return reply;
}

describe("notification click in an open app", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  });

  it("given the worker asks to open a deadline, then the router moves there in place and answers the worker", async () => {
    stubApi(({ url }) => (url.pathname === "/children" ? json([CHILD]) : json({ items: [] })));
    const container = givenServiceWorker();
    const router = await renderAppAt("/?tab=history");

    const reply = messageFromWorker(container, {
      type: "keepupkids:navigate",
      path: "/children?from=push",
    });

    await waitFor(() => expect(router.state.location.href).toBe("/children?from=push"));
    expect(reply.postMessage).toHaveBeenCalledWith("navigated");
  });

  it("given a target outside the app, then the router stays put and the worker gets no answer", async () => {
    stubApi(({ url }) => (url.pathname === "/children" ? json([CHILD]) : json({ items: [] })));
    const container = givenServiceWorker();
    const router = await renderAppAt("/?tab=history");

    const reply = messageFromWorker(container, {
      type: "keepupkids:navigate",
      path: "//evil.example/x",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(router.state.location.href).toBe("/?tab=history");
    expect(reply.postMessage).not.toHaveBeenCalled();
  });
});
