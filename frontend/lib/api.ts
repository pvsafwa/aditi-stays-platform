import { CORE_API_URL, CATALOG_API_URL, CHAT_HTTP_URL } from "@/lib/config";

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.detail || "Request failed");
  }
  return data as T;
}

function adminHeaders(token: string, actor = "admin-ops") {
  if (!token) {
    throw new Error("Admin token is required");
  }
  return {
    Authorization: `Bearer ${token}`,
    "X-Admin-Actor": actor,
  };
}

export async function getProperties() {
  return parse<{ data: any[] }>(await fetch(`${CATALOG_API_URL}/api/properties`, { cache: "no-store" }));
}

export async function getPropertyById(propertyId: string) {
  return parse<{ data: any }>(await fetch(`${CATALOG_API_URL}/api/properties/${encodeURIComponent(propertyId)}`, { cache: "no-store" }));
}

export async function getPropertyFeedbackSummary() {
  return parse<{ data: Array<{ property_id: string; avg_rating: number; review_count: number }> }>(
    await fetch(`${CATALOG_API_URL}/api/properties/feedback-summary`, { cache: "no-store" })
  );
}

export async function getPropertyReviews(propertyId: string) {
  return parse<{
    data: Array<{
      id: number;
      property_id: string;
      visitor_id: string;
      rating: number;
      comment: string;
      created_at: string;
    }>;
    summary: {
      property_id: string;
      avg_rating: number;
      review_count: number;
    };
  }>(await fetch(`${CATALOG_API_URL}/api/properties/${encodeURIComponent(propertyId)}/feedback`, { cache: "no-store" }));
}

export async function addPropertyFeedback(
  propertyId: string,
  payload: {
    visitor_id: string;
    rating: number;
    comment?: string;
  }
) {
  return parse<{ data: any }>(
    await fetch(`${CATALOG_API_URL}/api/properties/${encodeURIComponent(propertyId)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function trackBrowsing(visitorId: string, propertyId: string) {
  return parse<{ ok: boolean }>(
    await fetch(`${CATALOG_API_URL}/api/browsing-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId, property_id: propertyId }),
    })
  );
}

export async function getBrowsingHistory(visitorId: string) {
  return parse<{ data: Array<{ property_id: string; viewed_at: string }> }>(
    await fetch(`${CATALOG_API_URL}/api/browsing-history/${encodeURIComponent(visitorId)}`, { cache: "no-store" })
  );
}

export async function addWishlistItem(visitorId: string, propertyId: string) {
  return parse<{ ok: boolean }>(
    await fetch(`${CATALOG_API_URL}/api/wishlist/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitor_id: visitorId, property_id: propertyId }),
    })
  );
}

export async function removeWishlistItem(visitorId: string, propertyId: string) {
  return parse<{ ok: boolean }>(
    await fetch(`${CATALOG_API_URL}/api/wishlist/items?visitor_id=${visitorId}&property_id=${propertyId}`, {
      method: "DELETE",
    })
  );
}

export async function getWishlist(visitorId: string) {
  return parse<{ data: any[] }>(await fetch(`${CATALOG_API_URL}/api/wishlist/${visitorId}`, { cache: "no-store" }));
}

export async function compareProperties(propertyIds: string[]) {
  return parse<{ data: any[] }>(
    await fetch(`${CATALOG_API_URL}/api/comparisons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_ids: propertyIds }),
    })
  );
}

export async function checkAvailability(payload: {
  visitor_id: string;
  property_id: string;
  customer_name: string;
  mobile_number: string;
  disclaimer_accepted: boolean;
  from_date?: string;
  to_date?: string;
  members?: number;
}) {
  return parse<{ data: any; notice: string; recording_notice: string; resumed_chat: boolean; chat_id: number; chat_token: string }>(
    await fetch(`${CORE_API_URL}/api/leads/check-availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

export async function sendAutoIntroMessage(
  leadId: number,
  payload: {
    name: string;
    property_id: string;
    from_date: string;
    to_date: string;
    members: number;
  },
  chatToken?: string
) {
  const form = new FormData();
  form.append("name", payload.name);
  form.append("property_id", payload.property_id);
  form.append("from_date", payload.from_date);
  form.append("to_date", payload.to_date);
  form.append("members", String(payload.members));

  const headers: Record<string, string> = {};
  if (chatToken) {
    headers["X-Chat-Token"] = chatToken;
  }

  return parse<{ ok: boolean; data: any }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/auto-intro`, {
      method: "POST",
      headers,
      body: form,
    })
  );
}

export async function getChatMessagesForUser(leadId: number, chatToken: string) {
  return parse<{ data: any[] }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/messages`, {
      cache: "no-store",
      headers: {
        "X-Chat-Token": chatToken,
      },
    })
  );
}

export async function listBanners() {
  return parse<{ data: any[] }>(await fetch(`${CATALOG_API_URL}/api/banners`, { cache: "no-store" }));
}

export async function uploadProof(
  leadId: number,
  file: File,
  opts?: {
    chatToken?: string;
    adminToken?: string;
  }
) {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  if (opts?.adminToken) {
    headers.Authorization = `Bearer ${opts.adminToken}`;
  } else if (opts?.chatToken) {
    headers["X-Chat-Token"] = opts.chatToken;
  }

  return parse<{ ok: boolean; data: any }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/upload-proof`, {
      method: "POST",
      headers,
      body: form,
    })
  );
}

export async function getActiveLeads(adminToken: string, actor = "admin-ops") {
  return parse<{ data: any[] }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/active`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function getAllLeads(adminToken: string, actor = "admin-ops", limit = 200) {
  return parse<{ data: any[] }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/all?limit=${encodeURIComponent(String(limit))}`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function getLeadContext(leadId: number, adminToken: string, actor = "admin-ops") {
  return parse<{ data: any }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/${leadId}/context`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function getLeadMessages(leadId: number, adminToken: string, actor = "admin-ops") {
  return parse<{ data: any[] }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/${leadId}/messages`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function updateInventory(leadId: number, available: boolean, note: string, adminToken: string, actor = "admin-ops") {
  return parse<{ ok: boolean }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/${leadId}/inventory-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify({ available, note }),
    })
  );
}

export async function addPayment(
  leadId: number,
  amount: number,
  paymentType: "ADVANCE" | "FULL",
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ data: any }>(
    await fetch(`${CORE_API_URL}/api/admin/leads/${leadId}/payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify({ amount, payment_type: paymentType }),
    })
  );
}

export async function dailyAnalytics(adminToken: string, date?: string, actor = "admin-ops") {
  const q = date ? `?date=${date}` : "";
  return parse<{ data: any }>(
    await fetch(`${CORE_API_URL}/api/admin/analytics/daily${q}`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function summaryAnalytics(adminToken: string, actor = "admin-ops") {
  return parse<{ data: any }>(
    await fetch(`${CORE_API_URL}/api/admin/analytics/summary`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function shareGpay(leadId: number, qrUrl: string, mobileNumber: string, adminToken: string, actor = "admin-ops") {
  return parse<{ ok: boolean }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/share-gpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify({ qr_url: qrUrl, mobile_number: mobileNumber, sender_label: "Aditi Stays" }),
    })
  );
}

export async function confirmLeadViaChat(
  leadId: number,
  details: string,
  whatsappNumber: string | undefined,
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ ok: boolean; whatsapp_sent: boolean }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify({ details, whatsapp_number: whatsappNumber, sender_label: "Aditi Stays" }),
    })
  );
}

export async function sendAdminStatusMessage(
  leadId: number,
  text: string,
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ ok: boolean; data: any }>(
    await fetch(`${CHAT_HTTP_URL}/api/chat/${leadId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify({ sender_label: "Aditi Stays", text }),
    })
  );
}

export async function listAdminBanners(adminToken: string, actor = "admin-ops") {
  return parse<{ data: any[] }>(
    await fetch(`${CATALOG_API_URL}/api/admin/banners`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function addAdminBanner(
  payload: { title: string; url: string; platform: string; cover_url: string; metadata?: Record<string, unknown> },
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ data: any }>(
    await fetch(`${CATALOG_API_URL}/api/admin/banners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify(payload),
    })
  );
}

export async function uploadAdminBannerVideo(
  file: File,
  quality: string,
  bitrateKbps: number,
  adminToken: string,
  actor = "admin-ops"
) {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", quality);
  form.append("bitrate_kbps", String(bitrateKbps));

  return parse<{
    ok: boolean;
    data: { url: string; quality: string; bitrate_kbps: number; mime_type: string; file_name: string };
  }>(
    await fetch(`${CHAT_HTTP_URL}/api/admin/banners/upload`, {
      method: "POST",
      headers: adminHeaders(adminToken, actor),
      body: form,
    })
  );
}

export async function uploadAdminPropertyImage(file: File, adminToken: string, actor = "admin-ops") {
  const form = new FormData();
  form.append("file", file);
  return parse<{ ok: boolean; data: { url: string; mime_type: string; file_name: string } }>(
    await fetch(`${CHAT_HTTP_URL}/api/admin/properties/upload-image`, {
      method: "POST",
      headers: adminHeaders(adminToken, actor),
      body: form,
    })
  );
}

export async function deleteAdminBanner(bannerId: number, adminToken: string, actor = "admin-ops") {
  return parse<{ ok: boolean }>(
    await fetch(`${CATALOG_API_URL}/api/admin/banners/${bannerId}`, {
      method: "DELETE",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function updateAdminBanner(
  bannerId: number,
  payload: { title: string; url: string; platform: string; cover_url: string; metadata?: Record<string, unknown> },
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ data: any }>(
    await fetch(`${CATALOG_API_URL}/api/admin/banners/${bannerId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify(payload),
    })
  );
}

export async function addAdminProperty(
  payload: {
    id: string;
    location: string;
    nightly_price: number;
    family_friendly: boolean;
    amenities: string[];
    hero_image: string;
    media: string[];
    description: string;
  },
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ data: any }>(
    await fetch(`${CATALOG_API_URL}/api/admin/properties`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify(payload),
    })
  );
}

export async function listAdminProperties(adminToken: string, actor = "admin-ops") {
  return parse<{ data: any[] }>(
    await fetch(`${CATALOG_API_URL}/api/admin/properties`, {
      cache: "no-store",
      headers: adminHeaders(adminToken, actor),
    })
  );
}

export async function updateAdminProperty(
  propertyId: string,
  payload: {
    location: string;
    nightly_price: number;
    family_friendly: boolean;
    amenities: string[];
    hero_image: string;
    media: string[];
    description: string;
  },
  adminToken: string,
  actor = "admin-ops"
) {
  return parse<{ data: any }>(
    await fetch(`${CATALOG_API_URL}/api/admin/properties/${encodeURIComponent(propertyId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders(adminToken, actor),
      },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteAdminProperty(propertyId: string, adminToken: string, actor = "admin-ops") {
  return parse<{ ok: boolean }>(
    await fetch(`${CATALOG_API_URL}/api/admin/properties/${encodeURIComponent(propertyId)}`, {
      method: "DELETE",
      headers: adminHeaders(adminToken, actor),
    })
  );
}
