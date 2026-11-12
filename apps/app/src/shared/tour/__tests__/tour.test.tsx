// @vitest-environment jsdom
import { Button } from "@packages/ui/components/ui/button";
import { Tour, type TourStep } from "@packages/ui/components/ui/tour";
import { cleanup, screen } from "@testing-library/react";
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
