export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const key = "aditi_visitor_id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = `visitor-${crypto.randomUUID()}`;
    localStorage.setItem(key, value);
  }
  return value;
}
