import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

// The admin WebSocket connection (AdminNotificationsWebSocketHandler /
// ChatWebSocketHandler role=admin) still authenticates with a static shared
// secret, unrelated to the Keycloak JWT used for admin REST calls -- see
// chat-service's ChatSecurity.verifyAdminWsToken. That secret must never
// reach the client bundle directly, so it's served from this route, gated on
// having a valid (signed-in) NextAuth session. The real authorization
// boundary for every admin action is still each backend service's own
// signature-verified JWT check; this route just keeps a server-only secret
// off an unauthenticated wire.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const chatToken = process.env.ADMIN_CHAT_TOKEN || "";
  if (!chatToken) {
    return NextResponse.json({ error: "ADMIN_CHAT_TOKEN is not configured" }, { status: 500 });
  }

  return NextResponse.json({ chatToken });
}
