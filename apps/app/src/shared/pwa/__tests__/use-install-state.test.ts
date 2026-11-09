// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureInstallPrompt, useInstallState } from "../use-install-state";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";

function givenBrowser(userAgent: string, standalone: boolean) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(display-mode: standalone)" ? standalone : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe("useInstallState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("given Safari on an iPhone outside the home screen, then it reports ios, not standalone, no install prompt", () => {
    givenBrowser(IPHONE_SAFARI, false);

    const { result } = renderHook(() => useInstallState());

    expect(result.current).toEqual({
      platform: "ios",
      standalone: false,
      canPromptInstall: false,
    });
  });

  it("given Chrome on Android that offered an install prompt, then the prompt can be shown", () => {
    givenBrowser(ANDROID_CHROME, false);
    const stop = captureInstallPrompt(window);
    const { result } = renderHook(() => useInstallState());

    act(() => {
      window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    });

    expect(result.current).toEqual({
      platform: "android",
      standalone: false,
      canPromptInstall: true,
    });
    stop();
  });

  it("given the app was installed after the prompt, then the prompt is no longer offered", () => {
    givenBrowser(ANDROID_CHROME, true);
    const stop = captureInstallPrompt(window);
    const { result } = renderHook(() => useInstallState());

    act(() => {
      window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current).toEqual({
      platform: "android",
      standalone: true,
      canPromptInstall: false,
    });
    stop();
  });
});
