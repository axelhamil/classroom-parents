export interface PushServiceHosts {
  exact: readonly string[];
  suffixes: readonly string[];
}

export const PUSH_SERVICE_HOSTS: PushServiceHosts = {
  exact: ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"],
  suffixes: [".notify.windows.com", ".push.apple.com"],
};

export function isKnownPushService(endpoint: string, hosts = PUSH_SERVICE_HOSTS): boolean {
  if (!URL.canParse(endpoint)) return false;

  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  return hosts.exact.includes(host) || hosts.suffixes.some((suffix) => host.endsWith(suffix));
}
