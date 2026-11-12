import type { Page } from "@playwright/test";

export async function lowestGraphicContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((target) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;

    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;

      return [red, green, blue, alpha / 255];
    };

    const surfaceOf = (element: Element): number[] => {
      const layers: number[][] = [];
      for (let node = element.parentElement; node; node = node.parentElement) {
        const layer = rgba(getComputedStyle(node).backgroundColor);
        if ((layer[3] ?? 0) === 0) continue;
        layers.unshift(layer);
        if (layer[3] === 1) break;
      }

      return layers.reduce(
        (below, [red = 0, green = 0, blue = 0, alpha = 0]) =>
          [red, green, blue].map(
            (channel, index) => channel * alpha + (below[index] ?? 0) * (1 - alpha),
          ),
        [255, 255, 255],
      );
    };

    const luminance = (channels: number[]): number => {
      const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };

    const ratios = [...document.querySelectorAll(target)].map((element) => {
      const mark = luminance(rgba(getComputedStyle(element).backgroundColor));
      const surface = luminance(surfaceOf(element));

      return (Math.max(mark, surface) + 0.05) / (Math.min(mark, surface) + 0.05);
    });

    return ratios.length === 0 ? 0 : Math.min(...ratios);
  }, selector);
}
