import type { JWT } from "next-auth/jwt";
import type { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || "http://localhost:8180/realms/aditi-stays";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "admin-dashboard";
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || "";

// Keycloak access tokens are short-lived (default 5 minutes), so a plain
// jwt-callback-once approach would silently start failing admin API calls
// mid-session. Standard NextAuth refresh-token-rotation pattern: keep using
// the access token until just before it expires, then trade the refresh
// token for a new pair via Keycloak's token endpoint.
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: KEYCLOAK_CLIENT_ID,
        client_secret: KEYCLOAK_CLIENT_SECRET,
        refresh_token: token.refreshToken as string,
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) {
      throw refreshed;
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  // Confidential server-side OIDC client ("admin-dashboard" in
  // keycloak/realm-export.json) -- NextAuth's API routes run in Node.js, so
  // the standard authorization-code + client-secret flow applies here (not
  // the SPA/PKCE-only pattern a purely client-rendered app would need).
  providers: [
    KeycloakProvider({
      clientId: KEYCLOAK_CLIENT_ID,
      clientSecret: KEYCLOAK_CLIENT_SECRET,
      issuer: KEYCLOAK_ISSUER,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
          actor:
            profile && typeof profile === "object" && "preferred_username" in profile
              ? (profile as { preferred_username?: string }).preferred_username
              : token.actor,
        };
      }
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.actor = (token.actor as string | undefined) || session.user?.name || "admin";
      session.error = token.error as string | undefined;
      return session;
    },
  },
};
