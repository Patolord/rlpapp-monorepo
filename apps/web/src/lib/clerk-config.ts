const PRODUCTION_APP_HOST = "app.rlpeng.com.br";

export function resolveClerkProxyUrl(
  origin?: string,
  configuredProxyUrl?: string,
): string | undefined {
  if (configuredProxyUrl) {
    return configuredProxyUrl.endsWith("/")
      ? configuredProxyUrl
      : `${configuredProxyUrl}/`;
  }

  if (origin && new URL(origin).hostname === PRODUCTION_APP_HOST) {
    return `${origin}/__clerk/`;
  }

  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_APP_HOST) {
    return `${window.location.origin}/__clerk/`;
  }

  return undefined;
}
