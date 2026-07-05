// Everything goes through the gateway now, which routes to catalog-service,
// crm-service, and chat-service by path (see gateway/src/main/resources/application.yml).
export const CORE_API_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8090";
export const CATALOG_API_URL = CORE_API_URL;
export const CHAT_HTTP_URL = CORE_API_URL;
export const CHAT_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || "ws://localhost:8090";
