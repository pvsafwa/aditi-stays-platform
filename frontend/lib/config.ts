function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserOrigin(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return "";
  return window.location.origin;
}

function browserWsOrigin(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

const explicitCoreApiUrl = trimEnv(process.env.NEXT_PUBLIC_CORE_API_URL);
const explicitChatHttpUrl = trimEnv(process.env.NEXT_PUBLIC_CHAT_HTTP_URL);
const explicitChatWsUrl = trimEnv(process.env.NEXT_PUBLIC_CHAT_WS_URL);

export const CORE_API_URL = explicitCoreApiUrl || browserOrigin() || "http://localhost:8080";
export const CHAT_HTTP_URL = explicitChatHttpUrl || browserOrigin() || "http://localhost:8000";
export const CHAT_WS_URL = explicitChatWsUrl || browserWsOrigin() || "ws://localhost:8000";
