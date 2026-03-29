"use client";

import { Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ChatWindow from "@/components/ChatWindow";
import {
  addAdminBanner,
  addAdminProperty,
  addPayment,
  confirmLeadViaChat,
  dailyAnalytics,
  deleteAdminBanner,
  deleteAdminProperty,
  getAllLeads,
  getLeadContext,
  getLeadMessages,
  listAdminBanners,
  listAdminProperties,
  sendAdminStatusMessage,
  shareGpay,
  summaryAnalytics,
  updateAdminProperty,
  updateAdminBanner,
  updateInventory,
  uploadAdminBannerVideo,
  uploadAdminPropertyImage,
} from "@/lib/api";
import { AdminProperty, Lead } from "@/types";

type AdminSession = {
  apiToken: string;
  chatToken: string;
  actor: string;
};

type VideoCard = {
  id: number;
  title: string;
  url: string;
  platform: string;
  cover_url: string;
  metadata?: Record<string, unknown>;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

type LeadContextData = {
  lead?: Lead;
  browsing_history: Array<{ property_id: string; viewed_at: string }>;
  wishlist: Array<{ id: string; location?: string }>;
  payment_summary?: {
    advance_total?: number;
    full_total?: number;
    total?: number;
    count?: number;
  };
  payments?: Array<{
    id: number;
    amount: number;
    payment_type: string;
    created_at: string;
  }>;
};

type DailySnapshot = {
  inquiries: number;
  bookings: number;
};

type SummarySnapshot = {
  total_advance_sum: number;
  total_full_sum: number;
};

type ChatHistoryItem = {
  sender_role?: string;
  sender_label?: string;
  message_type?: string;
  content?: string;
  created_at?: string;
};

type PropertyFormState = {
  id: string;
  location: string;
  nightly_price: string;
  family_friendly: boolean;
  amenities: string;
  hero_image: string;
  media: string;
  description: string;
};

type LeadSearchMode = "all" | "open" | "closed";
type BannerSourceMode = "link" | "local_upload";
const HERO_FALLBACK_COVER = "https://images.unsplash.com/photo-1527631746610-bca00a040d60";
const DIRECT_VIDEO_URL_REGEX = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

function detectPlatform(url: string): VideoCard["platform"] {
  const normalized = url.toLowerCase();
  if (normalized.includes("instagram.com")) return "Instagram";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YouTube";
  if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(normalized)) return "LOCAL_VIDEO";
  return "Other";
}

function isDirectVideoUrl(url: string): boolean {
  return DIRECT_VIDEO_URL_REGEX.test(url.trim().toLowerCase());
}

function deriveHeroTitle(url: string, fallback: string): string {
  const clean = url.trim();
  if (!clean) return fallback;
  try {
    const parsed = new URL(clean);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last && last.includes(".")) return last;
  } catch {
    // ignore url parse failure and fallback below
  }
  return fallback;
}

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAdminProperty(raw: any): AdminProperty {
  return {
    id: String(raw?.id || ""),
    public_title: String(raw?.public_title || raw?.id || ""),
    location: String(raw?.location || "Unknown"),
    nightly_price: Number(raw?.nightly_price || 0),
    family_friendly: Boolean(raw?.family_friendly ?? true),
    amenities: Array.isArray(raw?.amenities) ? raw.amenities.map((item: unknown) => String(item)).filter(Boolean) : [],
    hero_image:
      String(raw?.hero_image || "").trim() || "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    media: Array.isArray(raw?.media) ? raw.media.map((item: unknown) => String(item)).filter(Boolean) : [],
    description: String(raw?.description || ""),
    active: Boolean(raw?.active ?? true),
    created_at: String(raw?.created_at || new Date().toISOString()),
  };
}

function normalizeVideoCard(raw: any): VideoCard {
  return {
    id: Number(raw?.id || 0),
    title: String(raw?.title || "Hero Video"),
    url: String(raw?.url || ""),
    platform: String(raw?.platform || "OTHER"),
    cover_url: String(raw?.cover_url || "").trim() || "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
    metadata: raw?.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {},
    active: Boolean(raw?.active ?? true),
    created_at: String(raw?.created_at || ""),
    updated_at: String(raw?.updated_at || ""),
  };
}

function isDirectHeroVideo(video: VideoCard): boolean {
  const url = video.url.trim().toLowerCase();
  const platform = (video.platform || "").toLowerCase();
  const mimeType = typeof video.metadata?.mime_type === "string" ? video.metadata.mime_type.toLowerCase() : "";
  if (platform.includes("local_video")) return true;
  if (mimeType.startsWith("video/")) return true;
  return DIRECT_VIDEO_URL_REGEX.test(url);
}

function formatLeadTime(value?: string): string {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity yet";

  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d ago`;
  return date.toLocaleDateString();
}

function asMoney(value: unknown): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${amount.toFixed(0)}`;
}

const defaultPropertyForm: PropertyFormState = {
  id: "",
  location: "",
  nightly_price: "",
  family_friendly: true,
  amenities: "",
  hero_image: "",
  media: "",
  description: "",
};

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState<AdminSession | null>(null);

  const [loginApiToken, setLoginApiToken] = useState("");
  const [loginChatToken, setLoginChatToken] = useState("");
  const [loginActor, setLoginActor] = useState("admin-ops");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [adminChatVisible, setAdminChatVisible] = useState(false);
  const [adminChatEnabled, setAdminChatEnabled] = useState(false);
  const [adminChatUnread, setAdminChatUnread] = useState(0);
  const [context, setContext] = useState<LeadContextData | null>(null);
  const [daily, setDaily] = useState<DailySnapshot | null>(null);
  const [summary, setSummary] = useState<SummarySnapshot | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const [qrUrl, setQrUrl] = useState("");
  const [gpayNumber, setGpayNumber] = useState("+91-9000000000");
  const [gpayUploadBusy, setGpayUploadBusy] = useState(false);
  const [gpayNotice, setGpayNotice] = useState<string | null>(null);
  const [confirmDetails, setConfirmDetails] = useState("Booking confirmed. Family check-in details will be shared shortly.");
  const [whatsapp, setWhatsapp] = useState("");
  const [inventoryNote, setInventoryNote] = useState("Rooms held after manual confirmation call.");
  const [paymentAmount, setPaymentAmount] = useState(2000);
  const [paymentType, setPaymentType] = useState<"ADVANCE" | "FULL">("ADVANCE");

  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [bannerSourceMode, setBannerSourceMode] = useState<BannerSourceMode>("link");
  const [bannerVideoFile, setBannerVideoFile] = useState<File | null>(null);
  const [bannerQuality, setBannerQuality] = useState("1080p");
  const [bannerBitrate, setBannerBitrate] = useState("6000");
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<number | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);

  const [properties, setProperties] = useState<AdminProperty[]>([]);
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>(defaultPropertyForm);
  const [propertySaving, setPropertySaving] = useState(false);
  const [propertyUploadBusy, setPropertyUploadBusy] = useState(false);
  const [propertyNotice, setPropertyNotice] = useState<string | null>(null);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadFilterMode, setLeadFilterMode] = useState<LeadSearchMode>("all");

  const selectedLead = useMemo(() => {
    const activeLead = leads.find((l) => l.id === selectedLeadId);
    if (activeLead) return activeLead;
    if (context?.lead?.id === selectedLeadId) return context.lead as Lead;
    return null;
  }, [leads, selectedLeadId, context]);

  const openStatuses = useMemo(() => new Set(["NEW_INQUIRY", "AVAILABLE", "PAYMENT_PENDING", "UNAVAILABLE"]), []);

  const leadCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const lead of leads) {
      if (openStatuses.has(lead.status.toUpperCase())) {
        open += 1;
      } else if (lead.status.toUpperCase() === "CONFIRMED") {
        closed += 1;
      }
    }
    return { all: leads.length, open, closed };
  }, [leads, openStatuses]);

  const filteredLeads = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    return leads.filter((lead) => {
      const status = lead.status.toUpperCase();
      if (leadFilterMode === "open" && !openStatuses.has(status)) {
        return false;
      }
      if (leadFilterMode === "closed" && status !== "CONFIRMED") {
        return false;
      }
      if (!term) return true;
      return (
        lead.property_id.toLowerCase().includes(term) ||
        lead.customer_name.toLowerCase().includes(term) ||
        lead.mobile_number.toLowerCase().includes(term) ||
        (lead.last_message || "").toLowerCase().includes(term) ||
        String(lead.id).includes(term)
      );
    });
  }, [leads, leadSearch, leadFilterMode, openStatuses]);

  const paymentSummary = context?.payment_summary || {};
  const paymentRows = context?.payments || [];

  const hydrateSavedSession = useCallback(() => {
    const apiToken = localStorage.getItem("aditi_admin_token") || "";
    const chatToken = localStorage.getItem("aditi_admin_chat_token") || apiToken;
    const actor = localStorage.getItem("aditi_admin_actor") || "admin-ops";

    setLoginApiToken(apiToken);
    setLoginChatToken(chatToken);
    setLoginActor(actor);

    if (!apiToken) {
      setAuthChecking(false);
      setIsAuthenticated(false);
      return;
    }

    void (async () => {
      try {
        const initialSession: AdminSession = { apiToken, chatToken, actor };
        await getAllLeads(initialSession.apiToken, initialSession.actor);
        setSession(initialSession);
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
        setSession(null);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    hydrateSavedSession();
  }, [hydrateSavedSession]);

  const saveSession = (next: AdminSession) => {
    localStorage.setItem("aditi_admin_token", next.apiToken);
    localStorage.setItem("aditi_admin_chat_token", next.chatToken);
    localStorage.setItem("aditi_admin_actor", next.actor);
  };

  const clearSession = () => {
    localStorage.removeItem("aditi_admin_token");
    localStorage.removeItem("aditi_admin_chat_token");
    localStorage.removeItem("aditi_admin_actor");
  };

  const handleLogin = async () => {
    setLoginError(null);
    setUiError(null);
    if (!loginApiToken.trim()) {
      setLoginError("API token is required.");
      return;
    }

    const next: AdminSession = {
      apiToken: loginApiToken.trim(),
      chatToken: (loginChatToken || loginApiToken).trim(),
      actor: loginActor.trim() || "admin-ops",
    };

    setLoginLoading(true);
    try {
      await getAllLeads(next.apiToken, next.actor);
      saveSession(next);
      setSession(next);
      setIsAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setIsAuthenticated(false);
    setLeads([]);
    setSelectedLeadId(null);
    setAdminChatVisible(false);
    setAdminChatEnabled(false);
    setAdminChatUnread(0);
    setContext(null);
    setDaily(null);
    setSummary(null);
    setUiError(null);
    setLoginError(null);
    setProperties([]);
    setEditingPropertyId(null);
    setPropertyForm(defaultPropertyForm);
    setPropertyModalOpen(false);
    setBannerModalOpen(false);
    setBannerVideoFile(null);
    setEditingBannerId(null);
    setLeadSearch("");
    setLeadFilterMode("all");
  };

  const refreshLeads = useCallback(async () => {
    if (!session) return;
    const next = await getAllLeads(session.apiToken, session.actor, 300);
    const list = next.data as Lead[];
    setLeads(list);

    setSelectedLeadId((prev) => {
      if (prev) return prev;
      if (!list.length) return null;
      return list[0].id;
    });
  }, [session]);

  const refreshAnalytics = useCallback(async () => {
    if (!session) return;
    const [d, s] = await Promise.all([
      dailyAnalytics(session.apiToken, undefined, session.actor),
      summaryAnalytics(session.apiToken, session.actor),
    ]);
    setDaily(d.data as DailySnapshot);
    setSummary(s.data as SummarySnapshot);
  }, [session]);

  const refreshBanners = useCallback(async () => {
    if (!session) return;
    const res = await listAdminBanners(session.apiToken, session.actor);
    setVideos(((res.data as any[]) || []).map(normalizeVideoCard).filter(isDirectHeroVideo));
  }, [session]);

  const refreshProperties = useCallback(async () => {
    if (!session) return;
    const res = await listAdminProperties(session.apiToken, session.actor);
    setProperties(((res.data as any[]) || []).map(normalizeAdminProperty));
  }, [session]);

  const refreshChatHistory = useCallback(
    async (leadId: number) => {
      if (!session) return;
      const res = await getLeadMessages(leadId, session.apiToken, session.actor);
      setChatHistory((res.data as ChatHistoryItem[]) || []);
    },
    [session]
  );

  const refreshContext = useCallback(
    async (leadId: number) => {
      if (!session) return;
      const ctx = await getLeadContext(leadId, session.apiToken, session.actor);
      setContext(ctx.data as LeadContextData);
      setWhatsapp((ctx.data as LeadContextData).lead?.mobile_number || "");
    },
    [session]
  );

  useEffect(() => {
    if (!isAuthenticated || !session) return;

    const boot = async () => {
      try {
        setUiError(null);
        await Promise.all([refreshLeads(), refreshAnalytics(), refreshBanners(), refreshProperties()]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load dashboard";
        setUiError(msg);
      }
    };
    void boot();

    const id = setInterval(() => {
      void refreshLeads().catch(() => undefined);
      void refreshAnalytics().catch(() => undefined);
    }, 10000);

    return () => clearInterval(id);
  }, [isAuthenticated, session, refreshLeads, refreshAnalytics, refreshBanners, refreshProperties]);

  useEffect(() => {
    if (!selectedLeadId || !session) return;
    const loadContext = async () => {
      try {
        await Promise.all([refreshContext(selectedLeadId), refreshChatHistory(selectedLeadId)]);
      } catch (err) {
        setUiError(err instanceof Error ? err.message : "Failed to load lead context");
      }
    };
    void loadContext();
  }, [selectedLeadId, session, refreshContext, refreshChatHistory]);

  const withActionGuard = async (fn: () => Promise<void>) => {
    try {
      setUiError(null);
      await fn();
    } catch (err) {
      setUiError(err instanceof Error ? err.message : "Operation failed");
    }
  };

  const runInventory = async (available: boolean) => {
    if (!selectedLeadId || !session) return;
    await withActionGuard(async () => {
      await updateInventory(selectedLeadId, available, inventoryNote, session.apiToken, session.actor);
      if (available) {
        await sendAdminStatusMessage(selectedLeadId, "Available. Please proceed with payment to block this stay.", session.apiToken, session.actor);
      } else {
        await sendAdminStatusMessage(
          selectedLeadId,
          "Not Available. Do you want to check other dates or another property?",
          session.apiToken,
          session.actor
        );
      }
      await refreshLeads();
      await refreshContext(selectedLeadId);
      await refreshChatHistory(selectedLeadId);
    });
  };

  const runQuickReply = async (text: string) => {
    if (!selectedLeadId || !session) return;
    await withActionGuard(async () => {
      await sendAdminStatusMessage(selectedLeadId, text, session.apiToken, session.actor);
      await refreshLeads();
      await refreshContext(selectedLeadId);
      await refreshChatHistory(selectedLeadId);
    });
  };

  const runShareGpay = async () => {
    if (!selectedLeadId || !session) return;
    if (!qrUrl.trim()) {
      setUiError("Upload a GPay QR image before sharing.");
      return;
    }
    if (!gpayNumber.trim()) {
      setUiError("Enter GPay mobile number before sharing.");
      return;
    }
    await withActionGuard(async () => {
      await shareGpay(selectedLeadId, qrUrl.trim(), gpayNumber.trim(), session.apiToken, session.actor);
      await refreshChatHistory(selectedLeadId);
      setGpayNotice("GPay details sent in chat");
    });
  };

  const uploadGpayQrImage = async (file: File | null) => {
    if (!session || !file) return;
    setGpayUploadBusy(true);
    setGpayNotice(null);
    try {
      const uploaded = await uploadAdminPropertyImage(file, session.apiToken, session.actor);
      setQrUrl(uploaded.data.url);
      setGpayNotice("GPay QR uploaded");
    } catch (err) {
      setGpayNotice(err instanceof Error ? err.message : "Failed to upload GPay QR");
    } finally {
      setGpayUploadBusy(false);
    }
  };

  const removeGpayQrImage = () => {
    setQrUrl("");
    setGpayNotice("GPay QR removed");
  };

  const runAddPayment = async () => {
    if (!selectedLeadId || !session) return;
    await withActionGuard(async () => {
      await addPayment(selectedLeadId, paymentAmount, paymentType, session.apiToken, session.actor);
      await refreshLeads();
      await refreshAnalytics();
      await refreshContext(selectedLeadId);
      await refreshChatHistory(selectedLeadId);
    });
  };

  const runConfirm = async () => {
    if (!selectedLeadId || !session) return;
    await withActionGuard(async () => {
      await confirmLeadViaChat(selectedLeadId, confirmDetails, whatsapp, session.apiToken, session.actor);
      await refreshLeads();
      await refreshAnalytics();
      await refreshContext(selectedLeadId);
      await refreshChatHistory(selectedLeadId);
    });
  };

  const adminChatQuickActions = useMemo(
    () => [
      { id: "send_gpay", label: "Send GPay", tone: "neutral" as const },
      { id: "available", label: "Available", tone: "mint" as const },
      { id: "not_available", label: "Not Available", tone: "danger" as const },
      { id: "booking_confirmed", label: "Booking Confirmed", tone: "accent" as const },
      { id: "sure", label: "Sure", tone: "neutral" as const },
      { id: "kindly_wait", label: "Kindly wait", tone: "neutral" as const },
    ],
    []
  );

  const handleAdminChatQuickAction = useCallback(
    (actionId: string) => {
      if (!selectedLeadId || !session) return;
      switch (actionId) {
        case "send_gpay":
          void runShareGpay();
          break;
        case "available":
          void runInventory(true);
          break;
        case "not_available":
          void runInventory(false);
          break;
        case "booking_confirmed":
          void runConfirm();
          break;
        case "sure":
          void runQuickReply("Sure.");
          break;
        case "kindly_wait":
          void runQuickReply("Kindly wait while we are checking with the property.");
          break;
        default:
          break;
      }
    },
    [selectedLeadId, session, runShareGpay, runInventory, runConfirm, runQuickReply]
  );

  const resetBannerForm = () => {
    setVideoUrl("");
    setBannerVideoFile(null);
    setBannerQuality("1080p");
    setBannerBitrate("6000");
    setBannerSourceMode("link");
    setEditingBannerId(null);
  };

  const startEditBanner = (video: VideoCard) => {
    setEditingBannerId(video.id);
    setVideoUrl(video.url || "");
    setBannerVideoFile(null);
    setBannerSourceMode("link");
    const quality = typeof video.metadata?.quality === "string" ? video.metadata.quality : "1080p";
    const bitrate = video.metadata?.bitrate_kbps;
    setBannerQuality(quality);
    if (typeof bitrate === "number" && Number.isFinite(bitrate) && bitrate > 0) {
      setBannerBitrate(String(Math.round(bitrate)));
    } else if (typeof bitrate === "string" && bitrate.trim() !== "") {
      setBannerBitrate(bitrate);
    } else {
      setBannerBitrate("6000");
    }
    setBannerNotice(null);
    setBannerModalOpen(true);
  };

  const addVideoBanner = async () => {
    if (!session) return;
    setBannerSaving(true);
    setBannerNotice(null);
    try {
      let url = videoUrl.trim();
      let platform = detectPlatform(url);
      const metadata: Record<string, unknown> = {};
      let title = deriveHeroTitle(url, `Hero Video ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);

      if (bannerSourceMode === "local_upload") {
        if (!bannerVideoFile) {
          setBannerNotice("Select a local video file first");
          return;
        }
        const bitrateValue = Number(bannerBitrate);
        const upload = await uploadAdminBannerVideo(
          bannerVideoFile,
          bannerQuality,
          Number.isFinite(bitrateValue) && bitrateValue > 0 ? bitrateValue : 6000,
          session.apiToken,
          session.actor
        );
        url = upload.data.url;
        platform = "LOCAL_VIDEO";
        metadata.quality = upload.data.quality;
        metadata.bitrate_kbps = upload.data.bitrate_kbps;
        metadata.mime_type = upload.data.mime_type;
        metadata.file_name = upload.data.file_name;
        metadata.source = "local_upload";
        title = deriveHeroTitle(url, upload.data.file_name || "Hero Video");
      } else {
        if (!url || !/^https?:\/\//i.test(url)) {
          setBannerNotice("Enter a valid video URL with http/https");
          return;
        }
        if (!isDirectVideoUrl(url)) {
          setBannerNotice("Use a direct video URL (.mp4/.webm/.mov) or choose Local Upload.");
          return;
        }
        platform = "LOCAL_VIDEO";
        metadata.source = "link";
      }

      const payload = {
        title,
        url,
        platform,
        cover_url: HERO_FALLBACK_COVER,
        metadata,
      };
      if (editingBannerId) {
        await updateAdminBanner(editingBannerId, payload, session.apiToken, session.actor);
      } else {
        await addAdminBanner(payload, session.apiToken, session.actor);
      }
      await refreshBanners();
      resetBannerForm();
      setBannerModalOpen(false);
      setBannerNotice(editingBannerId ? "Hero video updated" : "Hero video saved");
    } catch (err) {
      setBannerNotice(err instanceof Error ? err.message : "Failed to save hero video");
    } finally {
      setBannerSaving(false);
    }
  };

  const removeVideoBanner = (id: number) => {
    if (!session) return;
    void (async () => {
      try {
        await deleteAdminBanner(id, session.apiToken, session.actor);
        await refreshBanners();
        setBannerNotice("Hero video removed");
      } catch (err) {
        setBannerNotice(err instanceof Error ? err.message : "Failed to remove hero video");
      }
    })();
  };

  const updatePropertyForm = (field: keyof PropertyFormState, value: string | boolean) => {
    setPropertyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePropertyImageUpload = async (files: FileList | null, target: "hero" | "media") => {
    if (!session || !files || files.length === 0) return;
    setPropertyUploadBusy(true);
    setPropertyNotice(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadAdminPropertyImage(file, session.apiToken, session.actor);
        urls.push(uploaded.data.url);
      }
      if (target === "hero") {
        setPropertyForm((prev) => ({ ...prev, hero_image: urls[0] || prev.hero_image }));
        setPropertyNotice("Hero image uploaded");
      } else {
        setPropertyForm((prev) => {
          const merged = [...parseList(prev.media), ...urls];
          return { ...prev, media: Array.from(new Set(merged)).join("\n") };
        });
        setPropertyNotice(`${urls.length} gallery image(s) uploaded`);
      }
    } catch (err) {
      setPropertyNotice(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setPropertyUploadBusy(false);
    }
  };

  const createProperty = async () => {
    if (!session) return;
    setPropertySaving(true);
    setPropertyNotice(null);
    try {
      const amenities = parseList(propertyForm.amenities);
      const parsedMedia = parseList(propertyForm.media);
      const nightlyPrice = Number(propertyForm.nightly_price);
      const hero = propertyForm.hero_image.trim();
      const media = parsedMedia.length ? parsedMedia : hero ? [hero] : [];

      const payload = {
        location: propertyForm.location.trim(),
        nightly_price: Number.isFinite(nightlyPrice) ? nightlyPrice : 0,
        family_friendly: propertyForm.family_friendly,
        amenities,
        hero_image: hero,
        media,
        description: propertyForm.description.trim(),
      };

      if (editingPropertyId) {
        await updateAdminProperty(editingPropertyId, payload, session.apiToken, session.actor);
      } else {
        await addAdminProperty(
          {
            id: propertyForm.id.trim(),
            ...payload,
          },
          session.apiToken,
          session.actor
        );
      }
      setPropertyForm(defaultPropertyForm);
      setEditingPropertyId(null);
      setPropertyModalOpen(false);
      setPropertyNotice(editingPropertyId ? "Property updated successfully" : "Property added successfully");
      await refreshProperties();
    } catch (err) {
      setPropertyNotice(err instanceof Error ? err.message : "Property save failed");
    } finally {
      setPropertySaving(false);
    }
  };

  const startEditProperty = (property: AdminProperty) => {
    setEditingPropertyId(property.id);
    setPropertyForm({
      id: property.id,
      location: property.location,
      nightly_price: String(property.nightly_price),
      family_friendly: property.family_friendly,
      amenities: property.amenities.join(", "),
      hero_image: property.hero_image,
      media: property.media.join("\n"),
      description: property.description,
    });
    setPropertyNotice(`Editing ${property.id}`);
    setPropertyModalOpen(true);
  };

  const openCreatePropertyModal = () => {
    setEditingPropertyId(null);
    setPropertyForm(defaultPropertyForm);
    setPropertyNotice(null);
    setPropertyModalOpen(true);
  };

  const removeProperty = async (propertyId: string) => {
    if (!session) return;
    if (!window.confirm(`Deactivate ${propertyId}?`)) return;
    try {
      await deleteAdminProperty(propertyId, session.apiToken, session.actor);
      if (editingPropertyId === propertyId) {
        setEditingPropertyId(null);
        setPropertyForm(defaultPropertyForm);
      }
      setPropertyNotice(`Property ${propertyId} deactivated`);
      await refreshProperties();
    } catch (err) {
      setPropertyNotice(err instanceof Error ? err.message : "Failed to deactivate property");
    }
  };

  const parsedMedia = parseList(propertyForm.media);

  if (authChecking) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground shadow-[0_18px_46px_-36px_rgba(8,31,45,0.7)] backdrop-blur-xl">
          Loading admin session...
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !session) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <section className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-[0_26px_60px_-44px_rgba(8,31,45,0.75)] backdrop-blur-xl">
          <h1 className="text-2xl font-extrabold text-foreground">Admin Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">Secure access for CRM operations.</p>

          <div className="mt-4 grid gap-3">
            <input
              type="password"
              value={loginApiToken}
              onChange={(e) => setLoginApiToken(e.target.value)}
              placeholder="API bearer token"
              className="rounded-xl border border-border/60 bg-background/75 p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-mint/40"
            />
            <input
              type="password"
              value={loginChatToken}
              onChange={(e) => setLoginChatToken(e.target.value)}
              placeholder="Chat websocket token (optional if same as API token)"
              className="rounded-xl border border-border/60 bg-background/75 p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-mint/40"
            />
            <input
              value={loginActor}
              onChange={(e) => setLoginActor(e.target.value)}
              placeholder="Actor label (audit trail)"
              className="rounded-xl border border-border/60 bg-background/75 p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-mint/40"
            />
            <button
              onClick={() => void handleLogin()}
              disabled={loginLoading}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_14px_34px_-22px_rgba(248,181,0,0.85)] disabled:opacity-60"
            >
              {loginLoading ? "Logging in..." : "Login"}
            </button>
          </div>

          {loginError ? <p className="mt-3 text-sm text-rose-600">{loginError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 pb-10 pt-4 md:px-8 md:pt-6">
      <header className="rounded-[28px] border border-border/60 bg-[linear-gradient(120deg,hsl(var(--mint)/0.14),transparent_45%,hsl(var(--accent)/0.15))] p-5 shadow-[0_24px_60px_-42px_rgba(8,31,45,0.72)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="bg-gradient-to-r from-foreground via-foreground to-mint bg-clip-text text-3xl font-black tracking-tight text-transparent">
              Aditi Stays CRM
            </h1>
            <p className="text-sm text-muted-foreground">Logged in as {session.actor}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-rose-300/70 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-500/15 dark:text-rose-300"
          >
            Logout
          </button>
        </div>
        {uiError ? <p className="mt-2 text-xs text-rose-600">{uiError}</p> : null}
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)] backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Today Inquiries</p>
          <p className="text-2xl font-bold text-foreground">{daily?.inquiries ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)] backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Today Bookings</p>
          <p className="text-2xl font-bold text-foreground">{daily?.bookings ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)] backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Advance Collected</p>
          <p className="text-2xl font-bold text-foreground">₹{summary?.total_advance_sum ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)] backdrop-blur-xl">
          <p className="text-xs text-muted-foreground">Full Payments</p>
          <p className="text-2xl font-bold text-foreground">₹{summary?.total_full_sum ?? 0}</p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/72 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Current Properties</h2>
              <p className="text-xs text-muted-foreground">Add, edit, deactivate and upload local images.</p>
            </div>
            <button onClick={openCreatePropertyModal} className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
              Add Property
            </button>
          </div>
          {propertyNotice ? <p className="mt-2 text-xs text-mint">{propertyNotice}</p> : null}
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1 text-xs">
            {properties.map((property) => (
              <div key={property.id} className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{property.id}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      property.active ? "bg-mint/15 text-mint" : "bg-rose-500/15 text-rose-500"
                    }`}
                  >
                    {property.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <p className="text-muted-foreground">{property.location} · ₹{property.nightly_price}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => startEditProperty(property)} className="rounded-lg border border-border/60 px-2 py-1 text-[10px] text-foreground/85">
                    Edit
                  </button>
                  <button onClick={() => void removeProperty(property.id)} className="rounded-lg border border-rose-300/70 px-2 py-1 text-[10px] text-rose-600">
                    Deactivate
                  </button>
                </div>
              </div>
            ))}
            {properties.length === 0 ? <p className="text-muted-foreground">No properties found.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/72 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Hero Videos</h2>
              <p className="text-xs text-muted-foreground">Manage hero background video playlist for the home page.</p>
            </div>
            <button
              onClick={() => {
                resetBannerForm();
                setBannerNotice(null);
                setBannerModalOpen(true);
              }}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
            >
              Add Hero Video
            </button>
          </div>
          {bannerNotice ? <p className="mt-2 text-xs text-mint">{bannerNotice}</p> : null}
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {videos.map((video) => (
              <article key={video.id} className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
                <img
                  src={video.cover_url || "https://images.unsplash.com/photo-1527631746610-bca00a040d60"}
                  alt={video.title}
                  className="h-28 w-full object-cover"
                />
                <div className="p-3">
                  <p className="text-xs text-mint">{video.platform}</p>
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{video.title}</p>
                  {video.metadata?.quality ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {String(video.metadata.quality)} · {String(video.metadata.bitrate_kbps || "")} kbps
                    </p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border/60 px-2 py-1 text-xs text-foreground/85"
                    >
                      Open
                    </a>
                    <button onClick={() => startEditBanner(video)} className="rounded-lg border border-border/60 px-2 py-1 text-xs text-foreground/85">
                      Edit
                    </button>
                    <button onClick={() => removeVideoBanner(video.id)} className="rounded-lg border border-rose-300/70 px-2 py-1 text-xs text-rose-600">
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {videos.length === 0 ? <p className="text-xs text-muted-foreground">No hero videos added.</p> : null}
          </div>
        </div>
      </section>

      {propertyModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-card/80 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-foreground">{editingPropertyId ? `Edit ${editingPropertyId}` : "Add Property"}</h3>
              <button
                onClick={() => {
                  setPropertyModalOpen(false);
                  setEditingPropertyId(null);
                  setPropertyForm(defaultPropertyForm);
                }}
                className="rounded-lg border border-border/60 px-3 py-1 text-xs text-foreground/85"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input
                value={propertyForm.id}
                onChange={(e) => updatePropertyForm("id", e.target.value)}
                placeholder="ID (e.g., AD-Kodaikanal-04)"
                disabled={Boolean(editingPropertyId)}
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
              />
              <input
                value={propertyForm.location}
                onChange={(e) => updatePropertyForm("location", e.target.value)}
                placeholder="Location"
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
              />
              <input
                type="number"
                value={propertyForm.nightly_price}
                onChange={(e) => updatePropertyForm("nightly_price", e.target.value)}
                placeholder="Nightly price"
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
              />
              <input
                value={propertyForm.hero_image}
                onChange={(e) => updatePropertyForm("hero_image", e.target.value)}
                placeholder="Hero image URL"
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
              />
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                Upload Hero Image
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 block w-full text-xs"
                  onChange={(e) => {
                    void handlePropertyImageUpload(e.target.files, "hero");
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                Upload Gallery Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-2 block w-full text-xs"
                  onChange={(e) => {
                    void handlePropertyImageUpload(e.target.files, "media");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            <textarea
              value={propertyForm.amenities}
              onChange={(e) => updatePropertyForm("amenities", e.target.value)}
              placeholder="Amenities (comma/newline separated)"
              className="mt-2 h-20 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-xs text-foreground/85"
            />
            <textarea
              value={propertyForm.media}
              onChange={(e) => updatePropertyForm("media", e.target.value)}
              placeholder="Media image URLs (comma/newline separated)"
              className="mt-2 h-20 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-xs text-foreground/85"
            />
            {parsedMedia.length > 0 ? (
              <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-border/60 bg-background/60 p-2">
                <div className="flex flex-wrap gap-2">
                  {parsedMedia.map((url) => (
                    <div key={url} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-card/80 p-1">
                      <img src={url} alt="Media" className="h-14 w-14 object-cover" />
                      <button
                        onClick={() => {
                          const next = parsedMedia.filter((item) => item !== url);
                          updatePropertyForm("media", next.join("\n"));
                        }}
                        className="absolute right-1 top-1 hidden rounded bg-card/90 px-1 text-[10px] text-rose-600 group-hover:block"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <textarea
              value={propertyForm.description}
              onChange={(e) => updatePropertyForm("description", e.target.value)}
              placeholder="Description"
              className="mt-2 h-20 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-xs text-foreground/85"
            />

            <label className="mt-2 flex items-center gap-2 text-xs text-foreground/85">
              <input
                type="checkbox"
                checked={propertyForm.family_friendly}
                onChange={(e) => updatePropertyForm("family_friendly", e.target.checked)}
              />
              Family friendly
            </label>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void createProperty()}
                disabled={propertySaving || propertyUploadBusy}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
              >
                {propertySaving ? "Saving..." : propertyUploadBusy ? "Uploading..." : editingPropertyId ? `Save ${editingPropertyId}` : "Save Property"}
              </button>
              <button
                onClick={() => {
                  setPropertyModalOpen(false);
                  setEditingPropertyId(null);
                  setPropertyForm(defaultPropertyForm);
                }}
                className="rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/85"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bannerModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-card/80 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-foreground">{editingBannerId ? `Edit Hero Video #${editingBannerId}` : "Add Hero Video"}</h3>
              <button
                onClick={() => {
                  setBannerModalOpen(false);
                  resetBannerForm();
                }}
                className="rounded-lg border border-border/60 px-3 py-1 text-xs text-foreground/85"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select
                value={bannerSourceMode}
                onChange={(e) => setBannerSourceMode(e.target.value as BannerSourceMode)}
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85 md:col-span-2"
              >
                <option value="link">Video URL</option>
                <option value="local_upload">Upload Local Video</option>
              </select>
              {bannerSourceMode === "link" ? (
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://cdn.example.com/hero-video.mp4"
                  className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85 md:col-span-2"
                />
              ) : (
                <>
                  <label className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                    Select local video
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg"
                      onChange={(e) => setBannerVideoFile(e.target.files?.[0] ?? null)}
                      className="mt-2 block w-full text-xs"
                    />
                  </label>
                  <select
                    value={bannerQuality}
                    onChange={(e) => setBannerQuality(e.target.value)}
                    className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                    <option value="480p">480p</option>
                  </select>
                  <select
                    value={bannerBitrate}
                    onChange={(e) => setBannerBitrate(e.target.value)}
                    className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85"
                  >
                    <option value="8000">8000 kbps</option>
                    <option value="6000">6000 kbps</option>
                    <option value="3500">3500 kbps</option>
                    <option value="2000">2000 kbps</option>
                  </select>
                </>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void addVideoBanner()}
                disabled={bannerSaving}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
              >
                {bannerSaving ? "Saving..." : editingBannerId ? "Update Hero Video" : "Save Hero Video"}
              </button>
              <button
                onClick={() => {
                  setBannerModalOpen(false);
                  resetBannerForm();
                }}
                className="rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/85"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-2xl border border-border/60 bg-card/74 p-4 shadow-[0_18px_46px_-34px_rgba(8,31,45,0.72)] backdrop-blur-xl">
          <h2 className="font-bold text-foreground">Conversation Inbox</h2>
          <p className="text-xs text-muted-foreground">Ongoing and completed threads in one place.</p>
          <input
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder="Search id/name/mobile/property/message"
            className="mt-2 w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-mint/40"
          />
          <div className="mt-2 flex gap-2 text-xs">
            <button
              onClick={() => setLeadFilterMode("all")}
              className={`rounded-full border px-3 py-1 ${
                leadFilterMode === "all" ? "border-mint/65 bg-mint/10 text-mint" : "border-border/65 text-muted-foreground"
              }`}
            >
              All ({leadCounts.all})
            </button>
            <button
              onClick={() => setLeadFilterMode("open")}
              className={`rounded-full border px-3 py-1 ${
                leadFilterMode === "open" ? "border-mint/65 bg-mint/10 text-mint" : "border-border/65 text-muted-foreground"
              }`}
            >
              Open ({leadCounts.open})
            </button>
            <button
              onClick={() => setLeadFilterMode("closed")}
              className={`rounded-full border px-3 py-1 ${
                leadFilterMode === "closed" ? "border-mint/65 bg-mint/10 text-mint" : "border-border/65 text-muted-foreground"
              }`}
            >
              Closed ({leadCounts.closed})
            </button>
          </div>
          <div className="mt-3 max-h-[calc(100vh-270px)] space-y-2 overflow-y-auto pr-1">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  setAdminChatEnabled(true);
                  setAdminChatVisible(false);
                  setAdminChatUnread(0);
                }}
                className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                  selectedLeadId === lead.id
                    ? "border-mint/70 bg-mint/10 shadow-[0_12px_28px_-24px_rgba(83,216,196,0.85)]"
                    : "border-border/60 bg-background/55 hover:border-mint/40 hover:bg-mint/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">
                    #{lead.id} · {lead.property_id}
                  </p>
                  <span className="text-[10px] text-muted-foreground">{formatLeadTime(lead.last_message_at || lead.updated_at)}</span>
                </div>
                <p className="line-clamp-1 text-foreground">{lead.customer_name}</p>
                <p className="text-xs text-muted-foreground">{lead.mobile_number}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {lead.last_message ? `${lead.last_sender_role || "System"}: ${lead.last_message}` : "No chat messages yet."}
                </p>
                <div className="mt-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      openStatuses.has(lead.status.toUpperCase()) ? "bg-mint/15 text-mint" : "bg-background/80 text-muted-foreground"
                    }`}
                  >
                    {lead.status}
                  </span>
                </div>
              </button>
            ))}
            {selectedLeadId && !filteredLeads.some((lead) => lead.id === selectedLeadId) ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Lead #{selectedLeadId} is outside current filter. Adjust filter to view it in inbox.
              </div>
            ) : null}
            {filteredLeads.length === 0 ? <p className="text-xs text-muted-foreground">No conversations match this filter.</p> : null}
          </div>
        </aside>

        <section className="rounded-2xl border border-border/60 bg-card/74 p-4 shadow-[0_18px_46px_-34px_rgba(8,31,45,0.72)] backdrop-blur-xl">
          {selectedLeadId ? (
            <div className="h-[calc(100vh-265px)] min-h-[540px] max-h-[760px] overflow-y-auto pr-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-foreground">Lead #{selectedLeadId}</h2>
                  <p className="text-xs text-muted-foreground">Operations panel is fixed here. Live chat opens at bottom-right.</p>
                </div>
                <span className="rounded-full border border-border/65 bg-background/65 px-3 py-1 text-xs text-foreground/80">
                  {selectedLead?.status || context?.lead?.status || "NEW_INQUIRY"}
                </span>
              </div>

              <div className="space-y-3 pb-2">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead</p>
                    <p className="mt-1 font-semibold text-foreground">{context?.lead?.customer_name || selectedLead?.customer_name || "-"}</p>
                    <p className="text-muted-foreground">{context?.lead?.mobile_number || selectedLead?.mobile_number || "-"}</p>
                    <p className="mt-1 text-muted-foreground">Property: {context?.lead?.property_id || selectedLead?.property_id || "-"}</p>
                    <p className="text-muted-foreground">Status: {context?.lead?.status || selectedLead?.status || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Payments</p>
                    <p className="mt-1 text-foreground/85">Advance: {asMoney(paymentSummary.advance_total)}</p>
                    <p className="text-foreground/85">Full: {asMoney(paymentSummary.full_total)}</p>
                    <p className="text-foreground/85">Total: {asMoney(paymentSummary.total)}</p>
                    <p className="text-foreground/85">Entries: {Number(paymentSummary.count || 0)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-semibold text-foreground">Pre-Chat Intelligence</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Browsing History</p>
                      <ul className="mt-1 space-y-1 text-sm text-foreground/85">
                        {(context?.browsing_history || []).length === 0 ? <li className="text-muted-foreground">No browsing records.</li> : null}
                        {(context?.browsing_history || []).map((it, idx) => (
                          <li key={`${it.property_id}-${idx}`}>
                            {it.property_id} · {it.viewed_at ? new Date(it.viewed_at).toLocaleString() : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Wishlist</p>
                      <ul className="mt-1 space-y-1 text-sm text-foreground/85">
                        {(context?.wishlist || []).length === 0 ? <li className="text-muted-foreground">No wishlist items.</li> : null}
                        {(context?.wishlist || []).map((it) => (
                          <li key={it.id}>{it.id}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Share GPay in Chat</p>
                    {gpayNotice ? <p className="mt-2 text-xs text-mint">{gpayNotice}</p> : null}
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt="GPay QR"
                        className="mt-2 h-28 w-28 rounded-xl border border-border/60 object-cover"
                      />
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No QR uploaded.</p>
                    )}
                    <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-xs text-foreground/85">
                      {gpayUploadBusy ? "Uploading..." : qrUrl ? "Replace QR Image" : "Upload QR Image"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={gpayUploadBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          void uploadGpayQrImage(file);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {qrUrl ? (
                      <button
                        onClick={removeGpayQrImage}
                        className="mt-2 block rounded-lg border border-rose-300/70 px-3 py-2 text-xs text-rose-600"
                      >
                        Remove QR Image
                      </button>
                    ) : null}
                    <input
                      value={gpayNumber}
                      onChange={(e) => setGpayNumber(e.target.value)}
                      placeholder="GPay mobile"
                      className="mt-2 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-xs text-foreground/85"
                    />
                    <button
                      onClick={() => void runShareGpay()}
                      disabled={gpayUploadBusy}
                      className="mt-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                    >
                      Send GPay Details
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Inventory Check</p>
                    <textarea
                      value={inventoryNote}
                      onChange={(e) => setInventoryNote(e.target.value)}
                      className="mt-2 h-20 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-sm text-foreground/85"
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void runInventory(true)} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white">
                        Available
                      </button>
                      <button onClick={() => void runInventory(false)} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white">
                        Not Available
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Payment Entry</p>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                      className="mt-2 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-sm text-foreground/85"
                    />
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value as "ADVANCE" | "FULL")}
                      className="mt-2 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-sm text-foreground/85"
                    >
                      <option value="ADVANCE">ADVANCE</option>
                      <option value="FULL">FULL</option>
                    </select>
                    <button onClick={() => void runAddPayment()} className="mt-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white">
                      Save Payment
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Confirmation + WhatsApp</p>
                    <textarea
                      value={confirmDetails}
                      onChange={(e) => setConfirmDetails(e.target.value)}
                      className="mt-2 h-20 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-sm text-foreground/85"
                    />
                    <input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="WhatsApp Number"
                      className="mt-2 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-xs text-foreground/85"
                    />
                    <button onClick={() => void runConfirm()} className="mt-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900">
                      Send Confirmed Status
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-semibold text-foreground">Payment Ledger</p>
                  <div className="mt-2 max-h-36 space-y-2 overflow-y-auto text-xs">
                    {paymentRows.length === 0 ? <p className="text-muted-foreground">No payment entries for this lead.</p> : null}
                    {paymentRows.map((row) => (
                      <div key={row.id} className="rounded-lg border border-slate-200 bg-card/80 p-2 text-foreground/85">
                        {row.payment_type} · {asMoney(row.amount)} · {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-semibold text-foreground">Recorded Chat History</p>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
                    {chatHistory.length === 0 ? <p className="text-muted-foreground">No recorded messages yet.</p> : null}
                    {chatHistory.map((m, idx) => (
                      <div key={`${idx}-${m.created_at || idx}`} className="rounded-lg border border-slate-200 bg-card/80 p-2">
                        <p className="text-teal-700">{m.sender_label || m.sender_role || "System"}</p>
                        <p className="text-foreground/85">{m.content || "-"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {m.message_type || "TEXT"} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[calc(100vh-265px)] min-h-[500px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/70 text-sm text-muted-foreground">
              Select a lead from inbox to open operations and docked chat.
            </div>
          )}
        </section>
      </section>

      {selectedLeadId && adminChatEnabled && !adminChatVisible ? (
        <div className="fixed bottom-2 right-2 z-50 flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-2 py-2 shadow-xl backdrop-blur md:bottom-4 md:right-4">
          <button
            onClick={() => {
              setAdminChatEnabled(true);
              setAdminChatVisible(true);
              setAdminChatUnread(0);
            }}
            className="relative rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
          >
            Open Chat
            {adminChatUnread > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-bold text-slate-900">
                {adminChatUnread > 99 ? "99+" : adminChatUnread}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => {
              setAdminChatEnabled(false);
              setAdminChatVisible(false);
              setAdminChatUnread(0);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-foreground/85 hover:bg-background"
            aria-label="Close lead chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {selectedLeadId && adminChatEnabled ? (
        <div
          className={`fixed bottom-2 right-2 z-50 w-[calc(100vw-1rem)] max-w-[430px] transition duration-200 md:bottom-4 md:right-4 md:max-w-[420px] ${
            adminChatVisible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-3 opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-teal-700">Lead Chat</p>
                <p className="text-xs font-semibold text-foreground">
                  #{selectedLeadId} · {selectedLead?.property_id || context?.lead?.property_id || "Property"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAdminChatVisible(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Minimize chat"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setAdminChatVisible(false);
                    setAdminChatEnabled(false);
                    setAdminChatUnread(0);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="h-[76vh] min-h-[560px] max-h-[820px] p-2">
              <ChatWindow
                leadId={selectedLead?.id || selectedLeadId}
                role="admin"
                actor={session.actor}
                authToken={session.chatToken || session.apiToken}
                fillHeight
                showProofUpload={false}
                isVisible={adminChatVisible}
                onUnreadCountChange={setAdminChatUnread}
                quickActions={adminChatQuickActions}
                onQuickAction={handleAdminChatQuickAction}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
