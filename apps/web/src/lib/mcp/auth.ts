import { auth } from "@clerk/tanstack-react-start/server";
import type { AuthInfo } from "@modelcontextprotocol/server";

export async function verifyMcpOAuthToken(
  _request: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  try {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    if (
      clerkAuth.tokenType !== "oauth_token" ||
      !clerkAuth.isAuthenticated ||
      typeof clerkAuth.subject !== "string" ||
      clerkAuth.subject.length === 0
    ) {
      return undefined;
    }

    return {
      token: bearerToken,
      clientId: clerkAuth.id ?? "clerk",
      scopes: clerkAuth.scopes ?? [],
      extra: { userId: clerkAuth.subject },
    };
  } catch {
    return undefined;
  }
}

export function getAuthUserId(
  authInfo: AuthInfo | undefined
): string | undefined {
  const userId = authInfo?.extra?.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : undefined;
}
