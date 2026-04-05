"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minimize2, X } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import {
  addAdminBanner,
  addAdminProperty,
  addPayment,
  confirmLeadViaChat,
  dailyAnalytics,
  deleteAdminBanner,
  deleteAdminProperty,
  deletePayment,
  getGpaySettings,
  getAdminSession,
  getAllLeads,
  getLeadContext,
  getLeadMessages,
  listAdminBanners,
  listPayments,
  listAdminProperties,
  loginAdmin,
  logoutAdmin,
  sendAdminStatusMessage,
  shareGpay,
  summaryAnalytics,
  type AdminSessionData,
  updateGpaySettings,
  updateAdminProperty,
  updateAdminBanner,
  updateInventory,
  uploadAdminBannerVideo,
  uploadAdminPropertyImage,
} from "@/lib/api";
import { AdminProperty, Lead } from "@/types";

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
  trip_request?: {
    content?: string;
    property_id?: string;
    from_date?: string;
    to_date?: string;
    members?: number;
    created_at?: string;
  } | null;
  browsing_history: Array<{ property_id: string; viewed_at: string }>;
  wishlist: Array<{ id: string; location?: string; hero_image?: string; public_title?: string }>;
  compared_properties: Array<{ id: string; location?: string; hero_image?: string; public_title?: string }>;
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
    source?: string;
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
  metadata?: Record<string, unknown>;
  created_at?: string;
};

type PaymentLedgerRow = {
  id: number;
  lead_id: number;
  customer_name?: string;
  property_id?: string;
  amount: number;
  payment_type: string;
  source?: string;
  created_at: string;
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
type BannerPlacement = "hero" | "showcase";
type AdminView = "dashboard" | "properties" | "heroVideos" | "showcaseVideos" | "leadOps" | "settings" | "chatHistory";
type SettingsSection = "shareGpay" | "payments";
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

function readBannerPlacement(video: VideoCard): BannerPlacement {
  const placement = typeof video.metadata?.placement === "string" ? video.metadata.placement.trim().toLowerCase() : "";
  return placement === "showcase" ? "showcase" : "hero";
}

function readBannerPropertyId(video: VideoCard): string {
  return typeof video.metadata?.property_id === "string" ? video.metadata.property_id.trim() : "";
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

function collectMediaLinks(metadata?: Record<string, unknown>): string[] {
  if (!metadata) return [];
  const links: string[] = [];
  const candidates = [
    metadata.file_url,
    metadata.qr_url,
    metadata.media_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      links.push(candidate.trim());
    }
  }
  if (Array.isArray(metadata.media_urls)) {
    for (const value of metadata.media_urls) {
      if (typeof value === "string" && value.trim()) {
        links.push(value.trim());
      }
    }
  }
  return Array.from(new Set(links));
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
  const [session, setSession] = useState<AdminSessionData | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<AdminView>("dashboard");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("shareGpay");
  const [context, setContext] = useState<LeadContextData | null>(null);
  const [daily, setDaily] = useState<DailySnapshot | null>(null);
  const [summary, setSummary] = useState<SummarySnapshot | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);

  const [qrUrl, setQrUrl] = useState("");
  const [gpayNumber, setGpayNumber] = useState("+91-9000000000");
  const [gpayUploadBusy, setGpayUploadBusy] = useState(false);
  const [gpayNotice, setGpayNotice] = useState<string | null>(null);
  const [gpaySaving, setGpaySaving] = useState(false);
  const [confirmDetails, setConfirmDetails] = useState("Booking confirmed. Family check-in details will be shared shortly.");
  const [whatsapp, setWhatsapp] = useState("");
  const [inventoryNote, setInventoryNote] = useState("Rooms held after manual confirmation call.");
  const [paymentAmount, setPaymentAmount] = useState(2000);
  const [paymentType, setPaymentType] = useState<"ADVANCE" | "FULL">("ADVANCE");
  const [paymentLeadId, setPaymentLeadId] = useState<number | "">("");

  const [videos, setVideos] = useState<VideoCard[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [bannerSourceMode, setBannerSourceMode] = useState<BannerSourceMode>("link");
  const [bannerVideoFile, setBannerVideoFile] = useState<File | null>(null);
  const [bannerPlacement, setBannerPlacement] = useState<BannerPlacement>("hero");
  const [bannerPropertyId, setBannerPropertyId] = useState("");
  const [bannerQuality, setBannerQuality] = useState("1080p");
  const [bannerBitrate, setBannerBitrate] = useState("6000");
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<number | null>(null);

  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [leadDeskChatVisible, setLeadDeskChatVisible] = useState(false);
  const [leadDeskChatUnreadCount, setLeadDeskChatUnreadCount] = useState(0);
  const [paymentLedger, setPaymentLedger] = useState<PaymentLedgerRow[]>([]);

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
  const heroVideos = useMemo(() => videos.filter((video) => readBannerPlacement(video) === "hero"), [videos]);
  const showcaseVideos = useMemo(() => videos.filter((video) => readBannerPlacement(video) === "showcase"), [videos]);
  const selectedShowcaseProperty = useMemo(
    () => properties.find((property) => property.id === bannerPropertyId.trim()) || null,
    [properties, bannerPropertyId]
  );
  const bannerPlacementLabel = bannerPlacement === "showcase" ? "Showcase Video" : "Hero Video";

  const hydrateSavedSession = useCallback(() => {
    void (async () => {
      try {
        const current = await getAdminSession();
        setSession(current.data);
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

  const handleLogin = async () => {
    setLoginError(null);
    setUiError(null);
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Email and password are required.");
      return;
    }

    setLoginLoading(true);
    try {
      const next = await loginAdmin(loginEmail.trim(), loginPassword);
      setSession(next.data);
      setIsAuthenticated(true);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    void logoutAdmin().catch(() => undefined);
    setSession(null);
    setIsAuthenticated(false);
    setLeads([]);
    setSelectedLeadId(null);
    setActiveView("dashboard");
    setSettingsSection("shareGpay");
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
    setBannerPlacement("hero");
    setBannerPropertyId("");
    setLeadSearch("");
    setLeadFilterMode("all");
    setLeadDeskChatVisible(false);
    setLeadDeskChatUnreadCount(0);
    setPaymentLeadId("");
    setPaymentLedger([]);
  };

  const refreshLeads = useCallback(async () => {
    if (!session) return;
    const next = await getAllLeads(session.actor, 300);
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
    const [d, s] = await Promise.all([dailyAnalytics(undefined, session.actor), summaryAnalytics(session.actor)]);
    setDaily(d.data as DailySnapshot);
    setSummary(s.data as SummarySnapshot);
  }, [session]);

  const refreshBanners = useCallback(async () => {
    if (!session) return;
    const res = await listAdminBanners(session.actor);
    setVideos(((res.data as any[]) || []).map(normalizeVideoCard).filter(isDirectHeroVideo));
  }, [session]);

  const refreshProperties = useCallback(async () => {
    if (!session) return;
    const res = await listAdminProperties(session.actor);
    setProperties(((res.data as any[]) || []).map(normalizeAdminProperty));
  }, [session]);

  const refreshGpaySettings = useCallback(async () => {
    if (!session) return;
    const res = await getGpaySettings(session.actor);
    setQrUrl(String(res.data?.qr_url || "").trim());
    setGpayNumber(String(res.data?.mobile_number || "").trim());
  }, [session]);

  const refreshPaymentLedger = useCallback(async () => {
    if (!session) return;
    const res = await listPayments(session.actor, 250);
    setPaymentLedger((res.data as PaymentLedgerRow[]) || []);
  }, [session]);

  const refreshChatHistory = useCallback(
    async (leadId: number) => {
      if (!session) return;
      const res = await getLeadMessages(leadId, session.actor);
      setChatHistory((res.data as ChatHistoryItem[]) || []);
    },
    [session]
  );

  const refreshContext = useCallback(
    async (leadId: number) => {
      if (!session) return;
      const ctx = await getLeadContext(leadId, session.actor);
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
        await Promise.all([refreshLeads(), refreshAnalytics(), refreshBanners(), refreshProperties(), refreshGpaySettings(), refreshPaymentLedger()]);
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
  }, [isAuthenticated, session, refreshLeads, refreshAnalytics, refreshBanners, refreshProperties, refreshGpaySettings, refreshPaymentLedger]);

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

  useEffect(() => {
    setLeadDeskChatVisible(false);
    setLeadDeskChatUnreadCount(0);
    setPaymentLeadId((current) => (current === "" && selectedLeadId ? selectedLeadId : current));
  }, [selectedLeadId]);

  useEffect(() => {
    if (activeView !== "leadOps") {
      setLeadDeskChatVisible(false);
      setLeadDeskChatUnreadCount(0);
    }
  }, [activeView]);

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
      await updateInventory(selectedLeadId, available, inventoryNote, session.actor);
      if (available) {
        await sendAdminStatusMessage(selectedLeadId, "Available. Please proceed with payment to block this stay.", session.actor);
      } else {
        await sendAdminStatusMessage(
          selectedLeadId,
          "Not Available. Do you want to check other dates or another property?",
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
      await sendAdminStatusMessage(selectedLeadId, text, session.actor);
      await refreshLeads();
      await refreshContext(selectedLeadId);
      await refreshChatHistory(selectedLeadId);
    });
  };

  const runShareGpay = async () => {
    if (!selectedLeadId || !session) return;
    if (!qrUrl.trim()) {
      setUiError("Configure the GPay QR image in Settings before sharing it in chat.");
      return;
    }
    if (!gpayNumber.trim()) {
      setUiError("Configure the GPay mobile number in Settings before sharing it in chat.");
      return;
    }
    await withActionGuard(async () => {
      await shareGpay(selectedLeadId, qrUrl.trim(), gpayNumber.trim(), session.actor);
      await refreshChatHistory(selectedLeadId);
      setGpayNotice("GPay details sent in chat");
    });
  };

  const saveGpayConfig = async () => {
    if (!session) return;
    setGpaySaving(true);
    setGpayNotice(null);
    try {
      const res = await updateGpaySettings(
        {
          qr_url: qrUrl.trim(),
          mobile_number: gpayNumber.trim(),
        },
        session.actor
      );
      setQrUrl(String(res.data?.qr_url || "").trim());
      setGpayNumber(String(res.data?.mobile_number || "").trim());
      setGpayNotice("GPay settings saved");
    } catch (err) {
      setGpayNotice(err instanceof Error ? err.message : "Failed to save GPay settings");
    } finally {
      setGpaySaving(false);
    }
  };

  const uploadGpayQrImage = async (file: File | null) => {
    if (!session || !file) return;
    setGpayUploadBusy(true);
    setGpayNotice(null);
    try {
      const uploaded = await uploadAdminPropertyImage(file, session.actor);
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

  const runAddPayment = async (leadIdOverride?: number) => {
    const targetLeadId = leadIdOverride || selectedLeadId;
    if (!targetLeadId || !session) return;
    await withActionGuard(async () => {
      await addPayment(targetLeadId, paymentAmount, paymentType, session.actor);
      await refreshLeads();
      await refreshAnalytics();
      await refreshPaymentLedger();
      if (selectedLeadId === targetLeadId) {
        await refreshContext(selectedLeadId);
        await refreshChatHistory(selectedLeadId);
      }
    });
  };

  const runDeletePayment = async (paymentId: number, leadIdOverride?: number) => {
    const targetLeadId = leadIdOverride || selectedLeadId;
    if (!targetLeadId || !session) return;
    if (!window.confirm("Remove this payment entry? This is intended for mistaken additions.")) return;
    await withActionGuard(async () => {
      await deletePayment(targetLeadId, paymentId, session.actor);
      await refreshLeads();
      await refreshAnalytics();
      await refreshPaymentLedger();
      if (selectedLeadId === targetLeadId) {
        await refreshContext(selectedLeadId);
        await refreshChatHistory(selectedLeadId);
      }
    });
  };

  const runConfirm = async () => {
    if (!selectedLeadId || !session) return;
    await withActionGuard(async () => {
      await confirmLeadViaChat(selectedLeadId, confirmDetails, whatsapp, session.actor);
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

  const exportChatHistory = () => {
    if (!selectedLead) return;
    const payload = {
      lead: selectedLead,
      exported_at: new Date().toISOString(),
      messages: chatHistory.map((message) => ({
        sender_role: message.sender_role || "",
        sender_label: message.sender_label || "",
        message_type: message.message_type || "TEXT",
        content: message.content || "",
        metadata: message.metadata || {},
        created_at: message.created_at || "",
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lead-${selectedLead.id}-chat-history.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetBannerForm = (placement: BannerPlacement = "hero") => {
    setVideoUrl("");
    setBannerVideoFile(null);
    setBannerQuality("1080p");
    setBannerBitrate("6000");
    setBannerSourceMode("link");
    setEditingBannerId(null);
    setBannerPlacement(placement);
    setBannerPropertyId("");
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
    setBannerPlacement(readBannerPlacement(video));
    setBannerPropertyId(readBannerPropertyId(video));
    setBannerNotice(null);
    setBannerModalOpen(true);
  };

  const openCreateBannerModal = (placement: BannerPlacement) => {
    resetBannerForm(placement);
    setBannerNotice(null);
    setBannerModalOpen(true);
  };

  const addVideoBanner = async () => {
    if (!session) return;
    setBannerSaving(true);
    setBannerNotice(null);
    try {
      if (bannerPlacement === "showcase" && !bannerPropertyId.trim()) {
        setBannerNotice("Select the property this showcase video should open.");
        return;
      }
      let url = videoUrl.trim();
      let platform = detectPlatform(url);
      const metadata: Record<string, unknown> = { placement: bannerPlacement };
      if (bannerPlacement === "showcase") {
        metadata.property_id = bannerPropertyId.trim();
      }
      let title = deriveHeroTitle(
        url,
        `${bannerPlacement === "showcase" ? "Showcase" : "Hero"} Video ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
      );

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
          session.actor
        );
        url = upload.data.url;
        platform = "LOCAL_VIDEO";
        metadata.quality = upload.data.quality;
        metadata.bitrate_kbps = upload.data.bitrate_kbps;
        metadata.mime_type = upload.data.mime_type;
        metadata.file_name = upload.data.file_name;
        metadata.source = "local_upload";
        title = deriveHeroTitle(url, upload.data.file_name || `${bannerPlacement === "showcase" ? "Showcase" : "Hero"} Video`);
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

      const selectedProperty =
        bannerPlacement === "showcase" ? properties.find((property) => property.id === bannerPropertyId.trim()) || null : null;

      const payload = {
        title,
        url,
        platform,
        cover_url: selectedProperty?.hero_image || HERO_FALLBACK_COVER,
        metadata,
      };
      if (editingBannerId) {
        await updateAdminBanner(editingBannerId, payload, session.actor);
      } else {
        await addAdminBanner(payload, session.actor);
      }
      await refreshBanners();
      resetBannerForm(bannerPlacement);
      setBannerModalOpen(false);
      setBannerNotice(editingBannerId ? `${bannerPlacementLabel} updated` : `${bannerPlacementLabel} saved`);
    } catch (err) {
      setBannerNotice(err instanceof Error ? err.message : `Failed to save ${bannerPlacementLabel.toLowerCase()}`);
    } finally {
      setBannerSaving(false);
    }
  };

  const removeVideoBanner = (id: number) => {
    if (!session) return;
    const target = videos.find((video) => video.id === id) || null;
    const label = target ? (readBannerPlacement(target) === "showcase" ? "Showcase video" : "Hero video") : "Video";
    void (async () => {
      try {
        await deleteAdminBanner(id, session.actor);
        await refreshBanners();
        setBannerNotice(`${label} removed`);
      } catch (err) {
        setBannerNotice(err instanceof Error ? err.message : `Failed to remove ${label.toLowerCase()}`);
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
        const uploaded = await uploadAdminPropertyImage(file, session.actor);
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
        await updateAdminProperty(editingPropertyId, payload, session.actor);
      } else {
        await addAdminProperty(
          {
            id: propertyForm.id.trim(),
            ...payload,
          },
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
      await deleteAdminProperty(propertyId, session.actor);
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
  const selectedLeadStatus = selectedLead?.status || context?.lead?.status || "NEW_INQUIRY";
  const selectedLeadProperty = selectedLead?.property_id || context?.lead?.property_id || "Property";
  const tripRequest = context?.trip_request || null;
  const paymentEntryLead = typeof paymentLeadId === "number" ? leads.find((lead) => lead.id === paymentLeadId) || null : null;
  const filteredPaymentLedger =
    typeof paymentLeadId === "number" ? paymentLedger.filter((row) => row.lead_id === paymentLeadId) : paymentLedger;

  const settingsMenuButtonClass = (section: SettingsSection) =>
    `w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
      settingsSection === section
        ? "border-mint/70 bg-mint/12 text-foreground shadow-[0_14px_34px_-28px_rgba(83,216,196,0.8)]"
        : "border-border/60 bg-background/55 text-foreground/85 hover:border-mint/40 hover:bg-mint/5"
    }`;

  const navButtonClass = (view: AdminView) =>
    `w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
      activeView === view
        ? "border-mint/70 bg-mint/12 text-foreground shadow-[0_14px_34px_-28px_rgba(83,216,196,0.8)]"
        : "border-border/60 bg-background/55 text-foreground/85 hover:border-mint/40 hover:bg-mint/5"
    }`;

  const renderLeadSelector = (title: string, subtitle: string) => (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-background/60 p-3 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-mint">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <input
        value={leadSearch}
        onChange={(e) => setLeadSearch(e.target.value)}
        placeholder="Search id/name/mobile/property/message"
        className="mt-3 w-full rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-mint/40"
      />
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredLeads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => setSelectedLeadId(lead.id)}
            className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
              selectedLeadId === lead.id
                ? "border-mint/70 bg-mint/10 shadow-[0_12px_28px_-24px_rgba(83,216,196,0.85)]"
                : "border-border/60 bg-card/80 hover:border-mint/40 hover:bg-mint/5"
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
            Lead #{selectedLeadId} is outside the current filter. Adjust the filter to bring it back into the list.
          </div>
        ) : null}
        {filteredLeads.length === 0 ? <p className="text-xs text-muted-foreground">No leads match this filter.</p> : null}
      </div>
    </div>
  );

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
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="Admin email"
              className="rounded-xl border border-border/60 bg-background/75 p-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-mint/40"
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Password"
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="flex h-[calc(100vh-150px)] min-h-[760px] flex-col gap-4 rounded-[28px] border border-border/60 bg-card/78 p-4 shadow-[0_24px_54px_-42px_rgba(8,31,45,0.76)] backdrop-blur-xl xl:sticky xl:top-6">
          <div className="space-y-2">
            <button type="button" onClick={() => setActiveView("dashboard")} className={navButtonClass("dashboard")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Menu</span>
              <span className="mt-1 block">Dashboard</span>
            </button>
            <button type="button" onClick={() => setActiveView("properties")} className={navButtonClass("properties")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Menu</span>
              <span className="mt-1 block">Current Properties</span>
            </button>
            <button type="button" onClick={() => setActiveView("heroVideos")} className={navButtonClass("heroVideos")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Menu</span>
              <span className="mt-1 block">Hero Videos</span>
            </button>
            <button type="button" onClick={() => setActiveView("showcaseVideos")} className={navButtonClass("showcaseVideos")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Menu</span>
              <span className="mt-1 block">Showcase Videos</span>
            </button>
            <button type="button" onClick={() => setActiveView("leadOps")} className={navButtonClass("leadOps")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
              <span className="mt-1 block">Lead Operations</span>
            </button>
            <button type="button" onClick={() => setActiveView("settings")} className={navButtonClass("settings")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
              <span className="mt-1 block">Settings</span>
            </button>
            <button type="button" onClick={() => setActiveView("chatHistory")} className={navButtonClass("chatHistory")}>
              <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace</span>
              <span className="mt-1 block">Chat History</span>
            </button>
          </div>
        </aside>

        <section className="min-h-[calc(100vh-150px)] rounded-[28px] border border-border/60 bg-card/76 p-4 shadow-[0_24px_54px_-42px_rgba(8,31,45,0.76)] backdrop-blur-xl md:p-5">
          {activeView === "dashboard" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground">Dashboard</h2>
                <p className="text-sm text-muted-foreground">Daily business snapshot and lead overview.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)]">
                  <p className="text-xs text-muted-foreground">Today Inquiries</p>
                  <p className="text-2xl font-bold text-foreground">{daily?.inquiries ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)]">
                  <p className="text-xs text-muted-foreground">Today Bookings</p>
                  <p className="text-2xl font-bold text-foreground">{daily?.bookings ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)]">
                  <p className="text-xs text-muted-foreground">Advance Collected</p>
                  <p className="text-2xl font-bold text-foreground">₹{summary?.total_advance_sum ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.7)]">
                  <p className="text-xs text-muted-foreground">Full Payments</p>
                  <p className="text-2xl font-bold text-foreground">₹{summary?.total_full_sum ?? 0}</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Lead Snapshot</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground">All Leads</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{leadCounts.all}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground">Open Leads</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{leadCounts.open}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/80 p-3">
                      <p className="text-[11px] text-muted-foreground">Closed Leads</p>
                      <p className="mt-1 text-xl font-bold text-foreground">{leadCounts.closed}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Working Context</p>
                  <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <p>This CRM is now organized around one global left menu and a separate lead workspace when you need to act on a customer.</p>
                    <p>
                      Use <span className="font-semibold text-foreground">Lead Operations</span> for the live lead desk,
                      <span className="font-semibold text-foreground"> Settings</span> for GPay and ledger tools, and
                      <span className="font-semibold text-foreground"> Chat History</span> for read-only exports.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeView === "properties" ? (
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Current Properties</h2>
                  <p className="text-xs text-muted-foreground">Add, edit, deactivate and upload local images.</p>
                </div>
                <button onClick={openCreatePropertyModal} className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
                  Add Property
                </button>
              </div>
              {propertyNotice ? <p className="mt-2 text-xs text-mint">{propertyNotice}</p> : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {properties.map((property) => (
                  <div key={property.id} className="rounded-xl border border-border/60 bg-card/80 px-3 py-3 text-xs">
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
                    <p className="mt-1 text-muted-foreground">{property.location}</p>
                    <p className="text-muted-foreground">₹{property.nightly_price}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => startEditProperty(property)} className="rounded-lg border border-border/60 px-2 py-1 text-[10px] text-foreground/85">
                        Edit
                      </button>
                      <button onClick={() => void removeProperty(property.id)} className="rounded-lg border border-rose-300/70 px-2 py-1 text-[10px] text-rose-600">
                        Deactivate
                      </button>
                    </div>
                  </div>
                ))}
                {properties.length === 0 ? <p className="text-sm text-muted-foreground">No properties found.</p> : null}
              </div>
            </div>
          ) : null}

          {activeView === "heroVideos" ? (
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Hero Videos</h2>
                  <p className="text-xs text-muted-foreground">Manage the cinematic background video playlist for the homepage hero section.</p>
                </div>
                <button
                  onClick={() => openCreateBannerModal("hero")}
                  className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
                >
                  Add Hero Video
                </button>
              </div>
              {bannerNotice ? <p className="mt-2 text-xs text-mint">{bannerNotice}</p> : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {heroVideos.map((video) => (
                  <article key={video.id} className="overflow-hidden rounded-xl border border-border/60 bg-card/80">
                    <img
                      src={video.cover_url || "https://images.unsplash.com/photo-1527631746610-bca00a040d60"}
                      alt={video.title}
                      className="h-32 w-full object-cover"
                    />
                    <div className="p-3">
                      <p className="text-xs text-mint">{video.platform}</p>
                      <p className="line-clamp-1 text-sm font-semibold text-foreground">{video.title}</p>
                      {video.metadata?.quality ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {String(video.metadata.quality)} · {String(video.metadata.bitrate_kbps || "")} kbps
                        </p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
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
                {heroVideos.length === 0 ? <p className="text-sm text-muted-foreground">No hero videos added.</p> : null}
              </div>
            </div>
          ) : null}

          {activeView === "showcaseVideos" ? (
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Showcase Videos</h2>
                  <p className="text-xs text-muted-foreground">
                    Manage the portrait video cards that appear on the homepage and link visitors straight into a property page.
                  </p>
                </div>
                <button onClick={() => openCreateBannerModal("showcase")} className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
                  Add Showcase Video
                </button>
              </div>
              {bannerNotice ? <p className="mt-2 text-xs text-mint">{bannerNotice}</p> : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {showcaseVideos.map((video) => {
                  const linkedProperty = properties.find((property) => property.id === readBannerPropertyId(video)) || null;
                  return (
                    <article key={video.id} className="overflow-hidden rounded-[28px] border border-border/60 bg-card/80">
                      <div className="relative overflow-hidden bg-slate-950">
                        <div className="pointer-events-none absolute left-1/2 top-3 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black/85" />
                        <div className="aspect-[9/16]">
                          <video
                            src={video.url}
                            className="h-full w-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            poster={video.cover_url || linkedProperty?.hero_image || HERO_FALLBACK_COVER}
                          />
                        </div>
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(2,6,23,0.16)_62%,rgba(2,6,23,0.84)_100%)]" />
                        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-white/70">Homepage Card</p>
                          <p className="mt-2 text-base font-semibold">{linkedProperty?.public_title || linkedProperty?.id || "Property not linked"}</p>
                          <p className="mt-1 text-xs text-white/78">
                            Opens: {linkedProperty ? `${linkedProperty.id} · ${linkedProperty.location}` : "Select a property when editing"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 p-3">
                        <button onClick={() => startEditBanner(video)} className="rounded-lg border border-border/60 px-2 py-1 text-xs text-foreground/85">
                          Edit
                        </button>
                        <button onClick={() => removeVideoBanner(video.id)} className="rounded-lg border border-rose-300/70 px-2 py-1 text-xs text-rose-600">
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
                {showcaseVideos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No showcase videos added yet. Publish vertical clips here to populate the homepage grid.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeView === "leadOps" ? (
            <div className="grid h-[calc(100vh-190px)] min-h-[700px] gap-3 xl:grid-cols-[320px_1fr]">
              {renderLeadSelector("Lead Desk", "Select a lead to view details and reopen the live chat from the bottom-right corner.")}
              <div className="min-h-0 overflow-y-auto rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
                {selectedLeadId ? (
                  <div className="space-y-4 pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-foreground">Lead Operations</h2>
                        <p className="text-xs text-muted-foreground">Lead activity stays in this panel while the live chat remains tucked into the bottom-right corner.</p>
                      </div>
                      <span className="rounded-full border border-border/65 bg-background/65 px-3 py-1 text-xs text-foreground/80">
                        {selectedLeadStatus}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-border/60 bg-card/80 p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead</p>
                        <p className="mt-1 font-semibold text-foreground">{context?.lead?.customer_name || selectedLead?.customer_name || "-"}</p>
                        <p className="text-muted-foreground">{context?.lead?.mobile_number || selectedLead?.mobile_number || "-"}</p>
                        <p className="mt-1 text-muted-foreground">Property: {selectedLeadProperty}</p>
                        <p className="text-muted-foreground">Lead ID: #{selectedLeadId}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/80 p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment Summary</p>
                        <p className="mt-1 text-foreground/85">Advance: {asMoney(paymentSummary.advance_total)}</p>
                        <p className="text-foreground/85">Full: {asMoney(paymentSummary.full_total)}</p>
                        <p className="text-foreground/85">Total: {asMoney(paymentSummary.total)}</p>
                        <p className="text-foreground/85">Entries: {Number(paymentSummary.count || 0)}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/80 p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracking</p>
                        <p className="mt-1 text-foreground/85">Created: {selectedLead?.created_at ? new Date(selectedLead.created_at).toLocaleString() : "-"}</p>
                        <p className="text-foreground/85">Updated: {selectedLead?.updated_at ? new Date(selectedLead.updated_at).toLocaleString() : "-"}</p>
                        <p className="text-foreground/85">Last chat: {selectedLead?.last_message_at ? new Date(selectedLead.last_message_at).toLocaleString() : "No chat yet"}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                      <p className="text-sm font-semibold text-foreground">User Entered Details</p>
                      {tripRequest ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Requested Property</p>
                            <p className="mt-1 text-sm text-foreground/85">{String(tripRequest.property_id || selectedLeadProperty || "-")}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Dates</p>
                            <p className="mt-1 text-sm text-foreground/85">
                              {String(tripRequest.from_date || "-")} to {String(tripRequest.to_date || "-")}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Members</p>
                            <p className="mt-1 text-sm text-foreground/85">{tripRequest.members ? String(tripRequest.members) : "-"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Captured</p>
                            <p className="mt-1 text-sm text-foreground/85">
                              {tripRequest.created_at ? new Date(tripRequest.created_at).toLocaleString() : "-"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No structured trip requirement was recorded for this lead yet.</p>
                      )}
                      {tripRequest?.content ? <p className="mt-3 rounded-xl bg-background/70 p-3 text-sm text-foreground/85">{tripRequest.content}</p> : null}
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <p className="text-sm font-semibold text-foreground">Properties Viewed</p>
                        <div className="mt-3 space-y-2 text-sm">
                          {(context?.browsing_history || []).length === 0 ? <p className="text-muted-foreground">No viewed properties captured.</p> : null}
                          {(context?.browsing_history || []).map((item, idx) => (
                            <div key={`${item.property_id}-${idx}`} className="rounded-xl border border-border/60 bg-background/65 p-3">
                              <p className="font-medium text-foreground">{item.property_id}</p>
                              <p className="text-xs text-muted-foreground">{item.viewed_at ? new Date(item.viewed_at).toLocaleString() : "-"}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <p className="text-sm font-semibold text-foreground">Wishlisted</p>
                        <div className="mt-3 space-y-2 text-sm">
                          {(context?.wishlist || []).length === 0 ? <p className="text-muted-foreground">No wishlist activity recorded.</p> : null}
                          {(context?.wishlist || []).map((item) => (
                            <div key={item.id} className="rounded-xl border border-border/60 bg-background/65 p-3">
                              <p className="font-medium text-foreground">{item.id}</p>
                              <p className="text-xs text-muted-foreground">{item.location || "Location unavailable"}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <p className="text-sm font-semibold text-foreground">Compared</p>
                        <div className="mt-3 space-y-2 text-sm">
                          {(context?.compared_properties || []).length === 0 ? <p className="text-muted-foreground">No comparison history recorded.</p> : null}
                          {(context?.compared_properties || []).map((item) => (
                            <div key={item.id} className="rounded-xl border border-border/60 bg-background/65 p-3">
                              <p className="font-medium text-foreground">{item.id}</p>
                              <p className="text-xs text-muted-foreground">{item.location || "Location unavailable"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <p className="text-sm font-semibold text-foreground">Inventory Check</p>
                        <textarea
                          value={inventoryNote}
                          onChange={(e) => setInventoryNote(e.target.value)}
                          className="mt-3 h-24 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        />
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => void runInventory(true)} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white">
                            Available
                          </button>
                          <button onClick={() => void runInventory(false)} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white">
                            Not Available
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <p className="text-sm font-semibold text-foreground">Confirmation + WhatsApp</p>
                        <textarea
                          value={confirmDetails}
                          onChange={(e) => setConfirmDetails(e.target.value)}
                          className="mt-3 h-24 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        />
                        <input
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          placeholder="WhatsApp number"
                          className="mt-3 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        />
                        <button onClick={() => void runConfirm()} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900">
                          Send Confirmed Status
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[620px] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/70 text-sm text-muted-foreground">
                    Select a lead from the second column to open its operational view.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeView === "settings" ? (
            <div className="grid h-[calc(100vh-190px)] min-h-[700px] gap-3 xl:grid-cols-[280px_1fr]">
              <div className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-background/60 p-3 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-mint">Settings</p>
                  <p className="mt-1 text-sm text-muted-foreground">Platform-level configuration and finance utilities.</p>
                </div>
                <div className="mt-4 space-y-2">
                  <button type="button" onClick={() => setSettingsSection("shareGpay")} className={settingsMenuButtonClass("shareGpay")}>
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Config</span>
                    <span className="mt-1 block">Share GPay in Chat</span>
                  </button>
                  <button type="button" onClick={() => setSettingsSection("payments")} className={settingsMenuButtonClass("payments")}>
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Finance</span>
                    <span className="mt-1 block">Payments</span>
                  </button>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
                {settingsSection === "shareGpay" ? (
                  <div className="space-y-4 pb-2">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Share GPay in Chat</h2>
                      <p className="text-xs text-muted-foreground">Store the QR image and mobile number here. The actual send action stays inside live lead chat.</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                      {gpayNotice ? <p className="text-xs text-mint">{gpayNotice}</p> : null}
                      {qrUrl ? (
                        <img src={qrUrl} alt="GPay QR" className="mt-3 h-32 w-32 rounded-xl border border-border/60 object-cover" />
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">No QR configured yet.</p>
                      )}
                      <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-foreground/85">
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
                        <button onClick={removeGpayQrImage} className="mt-2 block rounded-lg border border-rose-300/70 px-3 py-2 text-xs text-rose-600">
                          Remove QR Image
                        </button>
                      ) : null}
                      <input
                        value={gpayNumber}
                        onChange={(e) => setGpayNumber(e.target.value)}
                        placeholder="GPay mobile number"
                        className="mt-3 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                      />
                      <button
                        onClick={() => void saveGpayConfig()}
                        disabled={gpayUploadBusy || gpaySaving}
                        className="mt-3 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-60"
                      >
                        {gpaySaving ? "Saving..." : "Save Settings"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {settingsSection === "payments" ? (
                  <div className="space-y-4 pb-2">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Payments</h2>
                      <p className="text-xs text-muted-foreground">Record a payment and review the current ledger in one place.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                        <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead</label>
                        <select
                          value={paymentLeadId === "" ? "" : String(paymentLeadId)}
                          onChange={(e) => setPaymentLeadId(e.target.value ? Number(e.target.value) : "")}
                          className="mt-2 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        >
                          <option value="">Select lead</option>
                          {leads.map((lead) => (
                            <option key={lead.id} value={lead.id}>
                              #{lead.id} · {lead.customer_name} · {lead.property_id}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                          className="mt-3 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        />
                        <select
                          value={paymentType}
                          onChange={(e) => setPaymentType(e.target.value as "ADVANCE" | "FULL")}
                          className="mt-3 w-full rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        >
                          <option value="ADVANCE">ADVANCE</option>
                          <option value="FULL">FULL</option>
                        </select>
                        <button
                          onClick={() => {
                            if (typeof paymentLeadId !== "number") {
                              setUiError("Select a lead before saving a payment entry.");
                              return;
                            }
                            void runAddPayment(paymentLeadId);
                          }}
                          className="mt-3 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white"
                        >
                          Save Payment
                        </button>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/80 p-4 text-sm">
                        <p className="text-sm font-semibold text-foreground">Selected Lead</p>
                        {paymentEntryLead ? (
                          <div className="mt-3 space-y-1 text-foreground/85">
                            <p>Lead #{paymentEntryLead.id}</p>
                            <p>{paymentEntryLead.customer_name}</p>
                            <p>{paymentEntryLead.mobile_number}</p>
                            <p>{paymentEntryLead.property_id}</p>
                          </div>
                        ) : (
                          <p className="mt-3 text-muted-foreground">Pick a lead to record a payment.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                          <p className="text-sm font-semibold text-foreground">Payment Ledger</p>
                          <p className="text-xs text-muted-foreground">Current ledger for the selected filter, with correction support for mistakes.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={paymentLeadId === "" ? "" : String(paymentLeadId)}
                          onChange={(e) => setPaymentLeadId(e.target.value ? Number(e.target.value) : "")}
                          className="rounded-lg border border-border/60 bg-background/70 p-2 text-sm text-foreground/85"
                        >
                          <option value="">All leads</option>
                          {leads.map((lead) => (
                            <option key={lead.id} value={lead.id}>
                              #{lead.id} · {lead.customer_name}
                            </option>
                          ))}
                        </select>
                        <span className="rounded-full bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                          {filteredPaymentLedger.length} entr{filteredPaymentLedger.length === 1 ? "y" : "ies"}
                        </span>
                      </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm">
                        {filteredPaymentLedger.length === 0 ? <p className="text-muted-foreground">No payment entries match the current filter.</p> : null}
                        {filteredPaymentLedger.map((row) => (
                          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/65 p-3">
                            <div>
                              <p className="font-medium text-foreground">
                                #{row.lead_id} · {row.customer_name || "Lead"} · {row.payment_type} · {asMoney(row.amount)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.property_id || "Property unavailable"} · {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                              </p>
                            </div>
                            <button
                              onClick={() => void runDeletePayment(row.id, row.lead_id)}
                              className="rounded-lg border border-rose-300/70 px-3 py-2 text-xs font-semibold text-rose-600"
                            >
                              Remove Entry
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeView === "chatHistory" ? (
            <div className="grid h-[calc(100vh-190px)] min-h-[700px] gap-3 xl:grid-cols-[320px_1fr]">
              {renderLeadSelector("Chat History", "Select a lead to read the recorded chat transcript or export it with media links.")}
              <div className="min-h-0 overflow-y-auto rounded-2xl border border-border/60 bg-background/60 p-4 shadow-[0_18px_44px_-34px_rgba(8,31,45,0.68)]">
                {selectedLeadId ? (
                  <div className="space-y-4 pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-foreground">Chat History</h2>
                        <p className="text-xs text-muted-foreground">Read-only history for the selected lead, with an export that keeps media links intact.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border/65 bg-background/65 px-3 py-1 text-xs text-foreground/80">
                          #{selectedLeadId} · {selectedLeadStatus}
                        </span>
                        <button onClick={exportChatHistory} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground">
                          Export with Media
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {chatHistory.length === 0 ? <p className="text-sm text-muted-foreground">No recorded messages yet.</p> : null}
                      {chatHistory.map((message, idx) => {
                        const mediaLinks = collectMediaLinks(message.metadata);
                        return (
                          <div key={`${idx}-${message.created_at || idx}`} className="rounded-xl border border-border/60 bg-card/80 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground">{message.sender_label || message.sender_role || "System"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {message.message_type || "TEXT"} · {message.created_at ? new Date(message.created_at).toLocaleString() : ""}
                              </p>
                            </div>
                            <p className="mt-2 text-sm text-foreground/85">{message.content || "-"}</p>
                            {mediaLinks.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {mediaLinks.map((link) => (
                                  <a
                                    key={link}
                                    href={link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-border/60 px-3 py-1.5 text-xs text-foreground/80 hover:bg-background/70"
                                  >
                                    Open Media
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[620px] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/70 text-sm text-muted-foreground">
                    Select a lead from the second column to inspect its recorded chat history.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {activeView === "leadOps" && selectedLeadId && !leadDeskChatVisible ? (
        <div className="fixed bottom-2 right-2 z-50 flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-2 py-2 shadow-xl backdrop-blur md:bottom-4 md:right-4">
          <button
            onClick={() => {
              setLeadDeskChatVisible(true);
              setLeadDeskChatUnreadCount(0);
            }}
            className="relative rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
          >
            Open Chat
            {leadDeskChatUnreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-bold text-slate-900">
                {leadDeskChatUnreadCount > 99 ? "99+" : leadDeskChatUnreadCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => {
              setLeadDeskChatVisible(false);
              setLeadDeskChatUnreadCount(0);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-foreground/85 hover:bg-background"
            aria-label="Close minimized chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {activeView === "leadOps" && selectedLeadId ? (
        <div
          className={`fixed bottom-2 right-2 z-50 w-[calc(100vw-1rem)] max-w-[430px] transition duration-200 md:bottom-4 md:right-4 md:max-w-[420px] ${
            leadDeskChatVisible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-teal-700">Lead Chat</p>
                <p className="text-xs font-semibold text-foreground">Aditi Stays Support · #{selectedLeadId}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLeadDeskChatVisible(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Minimize chat"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setLeadDeskChatVisible(false);
                    setLeadDeskChatUnreadCount(0);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-2">
              <ChatWindow
                leadId={selectedLead?.id || selectedLeadId}
                role="admin"
                actor={session.actor}
                fillHeight
                showProofUpload={false}
                isVisible={leadDeskChatVisible}
                onUnreadCountChange={setLeadDeskChatUnreadCount}
                quickActions={adminChatQuickActions}
                onQuickAction={handleAdminChatQuickAction}
              />
            </div>
          </div>
        </div>
      ) : null}

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
              <h3 className="text-lg font-bold text-foreground">{editingBannerId ? `Edit ${bannerPlacementLabel} #${editingBannerId}` : `Add ${bannerPlacementLabel}`}</h3>
              <button
                onClick={() => {
                  setBannerModalOpen(false);
                  resetBannerForm(bannerPlacement);
                }}
                className="rounded-lg border border-border/60 px-3 py-1 text-xs text-foreground/85"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select
                value={bannerPlacement}
                onChange={(e) => setBannerPlacement(e.target.value as BannerPlacement)}
                className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85 md:col-span-2"
              >
                <option value="hero">Hero Background Video</option>
                <option value="showcase">Homepage Showcase Video</option>
              </select>
              {bannerPlacement === "showcase" ? (
                <select
                  value={bannerPropertyId}
                  onChange={(e) => setBannerPropertyId(e.target.value)}
                  className="rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground/85 md:col-span-2"
                >
                  <option value="">Select target property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.id} · {property.location}
                    </option>
                  ))}
                </select>
              ) : null}
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
                  placeholder={bannerPlacement === "showcase" ? "https://cdn.example.com/showcase-video.mp4" : "https://cdn.example.com/hero-video.mp4"}
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
            {bannerPlacement === "showcase" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                This video will render as a phone-like portrait card on the homepage and open{" "}
                <span className="font-semibold text-foreground">{selectedShowcaseProperty?.id || "the selected property"}</span> when clicked.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Hero videos loop in the large homepage banner behind the landing headline.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void addVideoBanner()}
                disabled={bannerSaving}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
              >
                {bannerSaving ? "Saving..." : editingBannerId ? `Update ${bannerPlacementLabel}` : `Save ${bannerPlacementLabel}`}
              </button>
              <button
                onClick={() => {
                  setBannerModalOpen(false);
                  resetBannerForm(bannerPlacement);
                }}
                className="rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/85"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
