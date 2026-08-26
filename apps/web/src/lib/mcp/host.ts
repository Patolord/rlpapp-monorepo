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
  const host = hostHeader.split(",")[0]?.trim().toLowerCase();
  if (!host) return false;
  return allowedHosts.includes(host);
}
