// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, resetApp } from "../../../__tests__/app-harness";
import { schoolClock } from "../../agenda/school-clock";
import { InstallInvite } from "../install-invite";
import { captureInstallPrompt } from "../use-install-state";

const MONDAY = new Date(2026, 10, 16, 18, 0);
const TUESDAY = new Date(2026, 10, 17, 18, 0);
const WEDNESDAY = new Date(2026, 10, 18, 18, 0);
const INVITE = "Gardez KeepUpKids sur l'écran d'accueil";

function installPromptEvent() {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => ({ outcome: "accepted" })),
  });
}

async function openAppOn(day: Date) {
  cleanup();
  vi.setSystemTime(day);
  await renderWithProviders(<InstallInvite today={schoolClock(day).today} />);
}

describe("install invite", () => {
  let releasePrompt: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    releasePrompt = captureInstallPrompt();
    localStorage.clear();
  });

  afterEach(() => {
    releasePrompt();
    cleanup();
    resetApp();
    vi.useRealTimers();
  });

  it("given an installable browser, then the invite waits for a second day of use, and installing opens the browser's own prompt", async () => {
    const prompt = installPromptEvent();
    act(() => void window.dispatchEvent(prompt));

    await openAppOn(MONDAY);
    expect(screen.queryByText(INVITE)).toBeNull();

    await openAppOn(TUESDAY);
    fireEvent.click(screen.getByRole("button", { name: "Installer" }));

    expect(prompt.prompt).toHaveBeenCalledOnce();
  });

  it("given the parent answers later, then the invite stays away on the next days", async () => {
    act(() => void window.dispatchEvent(installPromptEvent()));
    await openAppOn(MONDAY);
    await openAppOn(TUESDAY);

    fireEvent.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(screen.queryByText(INVITE)).toBeNull();

    await openAppOn(WEDNESDAY);
    expect(screen.queryByText(INVITE)).toBeNull();
  });

  it("given a browser that cannot install, then no invite is shown, even on a second day", async () => {
    await openAppOn(MONDAY);
    await openAppOn(TUESDAY);

    expect(screen.queryByText(INVITE)).toBeNull();
  });
});
