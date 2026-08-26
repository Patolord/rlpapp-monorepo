export function parseAllowedHosts(value: string): string[] {
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);
}

export function isAllowedHost(
  hostHeader: string | null,
  allowedHosts: string[]
): boolean {
  if (!hostHeader) return false;
  if (hostHeader.includes(",")) return false;
  const host = hostHeader.trim().toLowerCase();
  if (!host) return false;
  return allowedHosts.includes(host);
}
