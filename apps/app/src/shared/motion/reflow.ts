const SETTLE_CAP_MS = 300;

function supportsReflow(): boolean {
  return (
    typeof document.startViewTransition === "function" &&
    CSS.supports("view-transition-name", "match-element") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function afterNextMutation(root: Element, change: () => void): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => settle());
    const cap = window.setTimeout(() => settle(), SETTLE_CAP_MS);

    function settle() {
      observer.disconnect();
      window.clearTimeout(cap);
      resolve();
    }

    observer.observe(root, { childList: true, subtree: true, attributes: true });
    change();
  });
}

/**
 * Runs a change that rearranges the deadlines on screen (a child filtered in or
 * out) inside a view transition, so each one slides to its new place instead of
 * jumping. The update ends at the first DOM mutation under `root` the change
 * causes, since the change may commit asynchronously (a navigation), and at
 * `SETTLE_CAP_MS` whatever happens. Where the browser cannot name elements
 * automatically, or under reduced motion, the change simply runs.
 */
export function reflow(root: Element | null, change: () => void): void {
  if (!root || !supportsReflow()) {
    change();
    return;
  }

  document.startViewTransition({
    update: () => afterNextMutation(root, change),
    types: ["list-reflow"],
  });
}
