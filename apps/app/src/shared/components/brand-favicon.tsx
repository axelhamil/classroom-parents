import { brandIconSvg } from "@packages/ui/components/ui/brand-link";
import { useEffect } from "react";

const SVG_ICON = 'link[rel="icon"][type="image/svg+xml"]';

function paintBrandFavicon() {
  const icon = document.querySelector(SVG_ICON);
  const tokens = getComputedStyle(document.documentElement);
  const token = (name: string) => tokens.getPropertyValue(name).trim();
  const fill = token("--primary");
  if (!icon || !fill) return;

  const svg = brandIconSvg({
    fill,
    ink: token("--primary-foreground"),
    accent: token("--warning"),
  });
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  if (icon.getAttribute("href") !== href) icon.setAttribute("href", href);
}

export function BrandFavicon() {
  useEffect(() => {
    paintBrandFavicon();

    const observer = new MutationObserver(paintBrandFavicon);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-palette"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
