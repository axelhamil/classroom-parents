// @vitest-environment jsdom
import { Button } from "@packages/ui/components/ui/button";
import { Tour, type TourStep } from "@packages/ui/components/ui/tour";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, resetApp } from "../../../__tests__/app-harness";

const LABELS = {
  progress: (current: number, total: number) => `Étape ${current} sur ${total}`,
  previous: "Précédent",
  next: "Suivant",
  skip: "Passer",
  finish: "Terminer",
};

const STEPS: TourStep[] = [
  { target: "first", title: "Premier repère", body: "Le premier." },
  { target: "missing", title: "Repère absent", body: "Jamais affiché." },
  { target: "last", title: "Dernier repère", body: "Le dernier." },
];

interface HarnessProps {
  onDone: () => void;
}

function Harness({ onDone }: HarnessProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button data-tour="first" onClick={() => setOpen(true)}>
        Lancer
      </Button>
      <span data-tour="last">Fin</span>
      <Tour
        steps={STEPS}
        open={open}
        labels={LABELS}
        onDone={() => {
          setOpen(false);
          onDone();
        }}
      />
    </>
  );
}

function SwappingHarness() {
  const [wide, setWide] = useState(false);

  return (
    <>
      <Button onClick={() => setWide(true)}>Pivoter</Button>
      {wide ? (
        <p key="columns" data-tour="first">
          Colonnes
        </p>
      ) : (
        <p key="strip" data-tour="first">
          Bandeau
        </p>
      )}
      <Tour steps={STEPS} open labels={LABELS} onDone={vi.fn()} />
    </>
  );
}

describe("guided tour", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("tour skips a step whose target is missing", async () => {
    const onDone = vi.fn();
    await renderWithProviders(<Harness onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: "Lancer" }));

    const tour = await screen.findByRole("dialog", { name: "Premier repère" });
    expect(tour.textContent).toContain("Étape 1 sur 2");

    await userEvent.click(screen.getByRole("button", { name: "Suivant" }));

    const last = await screen.findByRole("dialog", { name: "Dernier repère" });
    expect(last.textContent).toContain("Étape 2 sur 2");
    expect(screen.queryByText("Repère absent")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Terminer" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("Tab past the last control leaves the tour for the highlighted element", async () => {
    await renderWithProviders(<Harness onDone={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Lancer" });

    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Premier repère" });

    await userEvent.tab();

    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("dialog", { name: "Premier repère" })).toBeTruthy();
  });

  it("the tour follows its target when a rotation swaps the layout", async () => {
    await renderWithProviders(<SwappingHarness />);
    await screen.findByRole("dialog", { name: "Premier repère" });
    await waitFor(() =>
      expect(screen.getByText("Bandeau").hasAttribute("data-tour-active")).toBe(true),
    );

    await userEvent.click(screen.getByRole("button", { name: "Pivoter" }));
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() =>
      expect(screen.getByText("Colonnes").hasAttribute("data-tour-active")).toBe(true),
    );
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  it("a rotation scrolls the highlighted element back into view", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    await renderWithProviders(<Harness onDone={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Lancer" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Premier repère" });
    scrollIntoView.mockClear();

    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(trigger));
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("Escape closes the tour and returns focus", async () => {
    const onDone = vi.fn();
    await renderWithProviders(<Harness onDone={onDone} />);
    const trigger = screen.getByRole("button", { name: "Lancer" });

    await userEvent.click(trigger);
    await screen.findByRole("dialog", { name: "Premier repère" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Suivant" }));

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDone).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });
});
