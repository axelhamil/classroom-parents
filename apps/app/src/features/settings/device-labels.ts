export type DeviceKind = "ios" | "android" | "mac" | "windows" | "linux" | "unknown";

export type BrowserKind = "edge" | "samsung" | "firefox" | "chrome" | "safari" | "unknown";

export interface DeviceSummary {
  kind: DeviceKind;
  browser: BrowserKind;
}

const DEVICE_PATTERNS: readonly (readonly [DeviceKind, RegExp])[] = [
  ["ios", /iPhone|iPad|iPod/i],
  ["android", /Android/i],
  ["mac", /Macintosh|Mac OS X/i],
  ["windows", /Windows/i],
  ["linux", /Linux|CrOS/i],
];

const BROWSER_PATTERNS: readonly (readonly [BrowserKind, RegExp])[] = [
  ["edge", /Edg(e|A|iOS)?\//],
  ["samsung", /SamsungBrowser/],
  ["firefox", /Firefox|FxiOS/],
  ["chrome", /Chrome|CriOS/],
  ["safari", /Safari/],
];

function firstMatch<T extends string>(
  patterns: readonly (readonly [T, RegExp])[],
  userAgent: string,
): T | undefined {
  return patterns.find(([, pattern]) => pattern.test(userAgent))?.[0];
}

export function summarizeUserAgent(userAgent: string): DeviceSummary {
  return {
    kind: firstMatch(DEVICE_PATTERNS, userAgent) ?? "unknown",
    browser: firstMatch(BROWSER_PATTERNS, userAgent) ?? "unknown",
  };
}

export const DEVICE_KIND_KEYS = {
  ios: "devices.kind.ios",
  android: "devices.kind.android",
  mac: "devices.kind.mac",
  windows: "devices.kind.windows",
  linux: "devices.kind.linux",
  unknown: "devices.kind.unknown",
} as const satisfies Record<DeviceKind, string>;

export const BROWSER_KEYS = {
  edge: "devices.browser.edge",
  samsung: "devices.browser.samsung",
  firefox: "devices.browser.firefox",
  chrome: "devices.browser.chrome",
  safari: "devices.browser.safari",
  unknown: "devices.browser.unknown",
} as const satisfies Record<BrowserKind, string>;
