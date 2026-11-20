import type { Page } from "@playwright/test";

/**
 * Measures, on the rendered page, the three rules of the visual system a class scan cannot see: a combination of
 * classes correct one by one can still be wrong together. Returns one line per offending element, empty when the
 * page holds the system.
 */
export function visualSystemOffenders(page: Page): Promise<string[]> {
  return page.evaluate(measure);
}

function measure(): string[] {
  const ICON_SIZES = [8, 14, 16, 20];
  const NESTING_REACH = 32;
  const TOLERANCE = 2;
  const PILL = 9999;
  // A mark (checkbox, radio, dot) is smaller than the corner it sits near: it keeps its own radius.
  const MARK = 24;

  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const token = (name: string) =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * rem;
  const controlHeights = ["--control-sm", "--control-md", "--control-lg"].map(token);

  const visible = (element: Element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    // A visually hidden native control (1 px, clipped) is not on screen.
    return (
      box.width > 1 && box.height > 1 && style.visibility !== "hidden" && style.display !== "none"
    );
  };
  const name = (element: Element) =>
    `${element.tagName.toLowerCase()}${element.getAttribute("data-slot") ? `[${element.getAttribute("data-slot")}]` : ""} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`;
  const near = (value: number, allowed: number[]) =>
    allowed.some((size) => Math.abs(value - size) < 0.6);

  // Devtools and the tour halo are not the product; a toast is the library's own transient layer, its close button
  // held to the 24 px target floor in globals.css.
  const product = (element: Element) =>
    !element.closest(".tsqd-parent-container, [data-slot=tour], [data-sonner-toaster]");
  // A mark (checkbox tick, radio dot) draws at its own size, outside the icon scale.
  const inMark = (icon: Element) =>
    Boolean(
      icon.closest(
        "[data-slot=checkbox], [data-slot=radio-group-item], [role=checkbox], [role=radio]",
      ),
    );

  const icons = [...document.querySelectorAll("svg.lucide")]
    .filter(visible)
    .filter(product)
    .filter((icon) => !inMark(icon))
    .filter((icon) => !near(icon.getBoundingClientRect().width, ICON_SIZES))
    .map(
      (icon) => `icon ${icon.getBoundingClientRect().width}px: ${name(icon.parentElement ?? icon)}`,
    );

  // A control is a one-line action or field. Marks (checkbox, radio, switch), multi-line tiles, accordion triggers
  // (a disclosure row sized by its content, like a list row), links and the bottom navigation's items carry their
  // own sizes on purpose.
  const controls = [
    ...document.querySelectorAll(
      "button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, [role=combobox], [role=tab]",
    ),
  ]
    .filter(visible)
    .filter(product)
    .filter(
      (control) =>
        !control.matches(
          "[role=checkbox], [role=radio], [role=switch], [data-size=tile], [data-variant=day], [data-variant=link], [data-slot=accordion-trigger], [data-slot=app-navigation-item] *, [data-slot=tour] *",
        ) && !control.closest("[data-slot=app-navigation-item]"),
    )
    .filter((control) => !near(control.getBoundingClientRect().height, controlHeights))
    .map((control) => `control ${control.getBoundingClientRect().height}px: ${name(control)}`);

  const radius = (element: Element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  // A rounded box that paints nothing (no fill, no edge, no shadow) draws no corner to nest in.
  const paints = (element: Element) => {
    const style = getComputedStyle(element);

    return (
      !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) ||
      Number.parseFloat(style.borderTopWidth) > 0 ||
      style.boxShadow !== "none"
    );
  };
  const roundedParent = (element: Element) => {
    let parent = element.parentElement;
    while (parent && (radius(parent) === 0 || !paints(parent))) parent = parent.parentElement;

    return parent;
  };
  const nesting = [...document.querySelectorAll("body *")]
    .filter(visible)
    .filter(product)
    .filter((child) => radius(child) > 0 && paints(child))
    .flatMap((child) => {
      const parent = roundedParent(child);
      if (!parent) return [];

      const inner = child.getBoundingClientRect();
      const outer = parent.getBoundingClientRect();
      const gap = Math.min(inner.top - outer.top, inner.left - outer.left);
      const childRadius = Math.min(radius(child), inner.height / 2, inner.width / 2);
      const parentRadius = Math.min(radius(parent), outer.height / 2, outer.width / 2);
      const pill = radius(child) >= PILL / 2 || childRadius >= inner.height / 2 - 0.5;
      const mark = inner.width < MARK && inner.height < MARK;
      if (pill || mark || gap < 0 || gap >= NESTING_REACH || parentRadius <= gap) return [];

      const drift = parentRadius - gap - childRadius;

      return Math.abs(drift) > TOLERANCE
        ? [
            `radius ${childRadius}px in ${parentRadius}px at ${gap}px: ${name(child)} in ${name(parent)}`,
          ]
        : [];
    });

  return [...icons, ...controls, ...nesting];
}
