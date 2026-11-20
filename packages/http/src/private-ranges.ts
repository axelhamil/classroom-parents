import { BlockList, isIP } from "node:net";

/** Every IPv4 range unreachable from the public internet. */
export const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
];

/** Every IPv6 range unreachable from the public internet. */
export const PRIVATE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
];

const NOT_ROUTABLE_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["192.0.0.0", 24],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
];

const NOT_ROUTABLE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["64:ff9b::", 96],
  ["ff00::", 8],
];

const MAPPED_V4 = /^::ffff:/i;

const notPublic = new BlockList();
for (const [net, prefix] of [...PRIVATE_V4, ...NOT_ROUTABLE_V4])
  notPublic.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [...PRIVATE_V6, ...NOT_ROUTABLE_V6])
  notPublic.addSubnet(net, prefix, "ipv6");

/**
 * Whether an address is on the public internet: the check a server makes before fetching a URL a
 * user typed, so the request cannot reach the host itself, its private network or a cloud
 * metadata endpoint. IPv4-mapped and NAT64 IPv6 forms are refused outright rather than unwrapped.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && MAPPED_V4.test(address)) return false;

  return !notPublic.check(address, family === 4 ? "ipv4" : "ipv6");
}
