"use client";

import { CalendarDays, CheckCircle2, Clock3, MessageCircleMore, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { uploadProof } from "@/lib/api";
import { CHAT_WS_URL } from "@/lib/config";
import { ChatEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  leadId: number;
  role: "user" | "admin";
  actor: string;
  /** WebSocket auth: per-lead HMAC token for role=user, ADMIN_CHAT_TOKEN for role=admin. */
  authToken?: string;
  /** REST bearer for admin-only calls (upload-proof). Defaults to authToken; only diverges for role=admin, where the WS token and the Keycloak JWT are different values. */
  restToken?: string;
  hideLeadId?: boolean;
  userDisplayName?: string;
  propertyOptions?: Array<{ id: string; label?: string }>;
  defaultPropertyId?: string;
  defaultMembers?: number;
  fillHeight?: boolean;
  showProofUpload?: boolean;
  isVisible?: boolean;
  onUnreadCountChange?: (count: number) => void;
  quickActions?: Array<{
    id: string;
    label: string;
    tone?: "neutral" | "mint" | "danger" | "accent";
  }>;
  onQuickAction?: (actionId: string) => void;
};

function readMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function readMetaString(raw: unknown, key: string): string {
  const metadata = readMetadata(raw);
  const value = metadata[key];
  if (typeof value !== "string") return "";
  return value.trim();
}

function playNotificationBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    setTimeout(() => {
      void ctx.close();
    }, 250);
  } catch {
    // ignore audio errors
  }
}

export default function ChatWindow({
  leadId,
  role,
  actor,
  authToken,
  restToken,
  hideLeadId = false,
  userDisplayName,
  propertyOptions,
  defaultPropertyId = "",
  defaultMembers = 2,
  fillHeight = false,
  showProofUpload = true,
  isVisible = true,
  onUnreadCountChange,
  quickActions = [],
  onQuickAction,
}: Props) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const pendingOwnMessageScrollRef = useRef(false);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [alternativeMode, setAlternativeMode] = useState<"none" | "date" | "property">("none");
  const [alternativeFromDate, setAlternativeFromDate] = useState(todayStr);
  const [alternativeToDate, setAlternativeToDate] = useState(tomorrowStr);
  const [alternativePropertyId, setAlternativePropertyId] = useState(defaultPropertyId);
  const [alternativeMembers, setAlternativeMembers] = useState(defaultMembers);

  const wsUrl = useMemo(() => {
    const params = new URLSearchParams({ role, actor });
    if (authToken) {
      params.set("token", authToken);
    }
    return `${CHAT_WS_URL}/ws/chat/${leadId}?${params.toString()}`;
  }, [leadId, role, actor, authToken]);

  useEffect(() => {
    setMessages([]);
    setUnreadCount(0);
    pinnedToBottomRef.current = true;
    pendingOwnMessageScrollRef.current = false;
    setPreviewImageUrl(null);
    setAlternativePropertyId(defaultPropertyId);
    setAlternativeMembers(defaultMembers);
  }, [leadId, defaultMembers, defaultPropertyId]);

  const isNearBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }, []);

  const jumpToLatest = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    pinnedToBottomRef.current = true;
    setUnreadCount(0);
  }, []);

  const scheduleJumpToLatest = useCallback(() => {
    const tick = () => jumpToLatest();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(tick));
      return;
    }
    window.setTimeout(tick, 0);
  }, [jumpToLatest]);

  const handleListScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    pinnedToBottomRef.current = nearBottom;
    if (nearBottom) {
      setUnreadCount(0);
    }
  }, [isNearBottom]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    if (!isVisible) return;
    window.setTimeout(() => scheduleJumpToLatest(), 20);
  }, [isVisible, scheduleJumpToLatest]);

  useEffect(() => {
    if (!isVisible) return;
    if (!pendingOwnMessageScrollRef.current) return;
    pendingOwnMessageScrollRef.current = false;
    scheduleJumpToLatest();
  }, [messages, isVisible, scheduleJumpToLatest]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("Realtime connection lost");

    ws.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        if (parsed.event === "history") {
          setMessages(parsed.items || []);
          setUnreadCount(0);
          pinnedToBottomRef.current = true;
          if (isVisible) {
            window.setTimeout(() => scheduleJumpToLatest(), 30);
          }
          return;
        }
        if (parsed.event === "presence") {
          return;
        }
        if (parsed.event === "message") {
          setMessages((prev) => [...prev, parsed]);
          const incomingFromOtherSide = parsed.event === "message" && parsed.sender_role && parsed.sender_role !== role;
          if (incomingFromOtherSide) {
            playNotificationBeep();
            if (!isVisible || !pinnedToBottomRef.current) {
              setUnreadCount((prev) => prev + 1);
            } else {
              scheduleJumpToLatest();
            }
            return;
          }
          if (isVisible && pinnedToBottomRef.current) {
            scheduleJumpToLatest();
          }
        }
      } catch {
        // noop
      }
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, role, isVisible, scheduleJumpToLatest]);

  const sendPayload = (messageText: string, metadata: Record<string, unknown> = {}) => {
    if (!messageText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    pinnedToBottomRef.current = true;
    pendingOwnMessageScrollRef.current = true;
    if (isVisible) {
      scheduleJumpToLatest();
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        sender_role: role,
        sender_label: role === "admin" ? "Aditi Stays" : userDisplayName || "Guest",
        text: messageText,
        metadata,
      })
    );
  };

  const sendMessage = () => {
    if (!text.trim()) return;
    sendPayload(text.trim(), {});
    setText("");
  };

  const sendAlternativeRequest = () => {
    const propertyId = alternativeMode === "property" ? alternativePropertyId.trim() : "";
    if (!alternativeFromDate || !alternativeToDate) {
      setError("Select from and till dates.");
      return;
    }
    if (new Date(alternativeToDate).getTime() < new Date(alternativeFromDate).getTime()) {
      setError("Till date should be after from date.");
      return;
    }
    if (alternativeMode === "property" && !propertyId) {
      setError("Select a property.");
      return;
    }

    const requestedProperty = propertyId || "same property";
    const msg =
      `Can you check availability for ${requestedProperty} from ${alternativeFromDate} to ${alternativeToDate}` +
      ` for ${alternativeMembers} member(s)?`;

    sendPayload(msg, {
      request_type: alternativeMode === "property" ? "alternate_property" : "alternate_dates",
      property_id: propertyId || undefined,
      from_date: alternativeFromDate,
      to_date: alternativeToDate,
      members: alternativeMembers,
    });
    setAlternativeMode("none");
    setError(null);
  };

  const onProofUpload = async (file: File | null) => {
    if (!file) return;
    if (role === "user" && !authToken) {
      setError("Chat session expired. Click Check Availability to resume.");
      return;
    }
    try {
      await uploadProof(
        leadId,
        file,
        role === "admin" ? { adminToken: restToken ?? authToken } : { chatToken: authToken }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const showUnavailablePrompt = useMemo(() => {
    if (role !== "user") return false;
    const latestAdminMessage = [...messages]
      .reverse()
      .find((m) => m.event === "message" && m.sender_role === "admin" && typeof m.content === "string");
    const content = (latestAdminMessage?.content || "").toLowerCase();
    return content.includes("not available") || content.includes("unavailable");
  }, [messages, role]);

  const hasQuickActions = role === "admin" && quickActions.length > 0;

  const quickActionClass = (tone: "neutral" | "mint" | "danger" | "accent" = "neutral") => {
    if (tone === "mint") {
      return "border-mint/50 bg-mint/10 text-mint hover:bg-mint/[0.18]";
    }
    if (tone === "danger") {
      return "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15";
    }
    if (tone === "accent") {
      return "border-accent/60 bg-accent/[0.14] text-accent hover:bg-accent/20";
    }
    return "border-border bg-secondary/60 text-foreground/85 hover:border-primary/45 hover:text-primary";
  };

  return (
    <div
      className={`overflow-hidden rounded-3xl border border-border bg-card/80 shadow-luxe backdrop-blur-xl ${
        fillHeight ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-border bg-[linear-gradient(90deg,hsl(var(--primary)/0.10),transparent_36%,hsl(var(--accent)/0.12))] px-4 py-3.5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Recorded Conversation</p>
          <h3 className="font-display text-base font-semibold text-foreground">{hideLeadId ? "Live Chat" : `Lead #${leadId}`}</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${connected ? "bg-mint/[0.14] text-mint" : "bg-destructive/12 text-destructive"}`}>
          {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={handleListScroll}
        className={`relative overflow-y-auto bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.07),transparent_46%),radial-gradient(circle_at_bottom,hsl(var(--accent)/0.07),transparent_45%)] p-4 ${
          fillHeight ? "min-h-0 flex-1" : "h-80"
        }`}
      >
        <div className="space-y-2.5">
          {messages.map((m, idx) => {
            const ownMessage = m.sender_role === role;
            const metadataRaw = (m as { metadata?: unknown }).metadata;
            const proofImageUrl = readMetaString(metadataRaw, "file_url");
            const qrImageUrl = readMetaString(metadataRaw, "qr_url");
            const previewableImageUrl = proofImageUrl || qrImageUrl;

            return (
              <div key={`${idx}-${m.created_at}`} className={`w-full ${ownMessage ? "text-right" : "text-left"}`}>
                <div
                  className={`inline-block max-w-[90%] rounded-2xl px-3.5 py-2.5 text-left shadow-luxe-sm ${
                    ownMessage
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border bg-secondary text-secondary-foreground"
                  }`}
                >
                  <p className={`text-[10px] uppercase tracking-[0.14em] ${ownMessage ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{m.sender_label || "System"}</p>
                  <p className="mt-0.5 text-sm leading-relaxed">{m.content}</p>
                  {previewableImageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImageUrl(previewableImageUrl)}
                      className={`mt-2 block overflow-hidden rounded-xl border ${ownMessage ? "border-primary-foreground/30" : "border-border"}`}
                    >
                      <img src={previewableImageUrl} alt="Chat attachment" className="h-28 w-28 object-cover" loading="lazy" decoding="async" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isVisible && unreadCount > 0 ? (
        <div className="px-4 pt-3">
          <Button
            onClick={jumpToLatest}
            variant="outline"
            className="h-8 rounded-full border-accent/50 bg-accent/[0.12] px-3 text-xs font-medium text-accent transition hover:bg-accent/20"
          >
            {unreadCount} new message(s) · Jump to latest
          </Button>
        </div>
      ) : null}

      {showUnavailablePrompt ? (
        <div className="mx-4 mt-3 rounded-2xl border border-accent/40 bg-accent/[0.10] p-3 shadow-luxe-sm">
          <p className="text-xs text-foreground">This stay seems unavailable. Want to check another date or another property?</p>
          <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
            <Button
              onClick={() => setAlternativeMode("date")}
              variant="outline"
              className="h-8 rounded-full border-border bg-background/70 px-3 text-xs transition hover:border-primary/45 hover:text-primary"
            >
              Check Different Dates
            </Button>
            <Button
              onClick={() => setAlternativeMode("property")}
              variant="outline"
              className="h-8 rounded-full border-border bg-background/70 px-3 text-xs transition hover:border-primary/45 hover:text-primary"
            >
              Choose Another Property
            </Button>
          </div>
          {alternativeMode !== "none" ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {alternativeMode === "property" ? (
                <div className="md:col-span-2">
                  <Select value={alternativePropertyId || "__none__"} onValueChange={(value) => setAlternativePropertyId(value === "__none__" ? "" : value)}>
                    <SelectTrigger className="h-10 rounded-xl border-input bg-background">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select property</SelectItem>
                      {(propertyOptions || []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label || item.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <label className="space-y-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  From Date
                </span>
                <Input type="date" value={alternativeFromDate} onChange={(e) => setAlternativeFromDate(e.target.value)} className="h-10 rounded-xl border-input bg-background text-xs focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="space-y-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-accent" />
                  Till Date
                </span>
                <Input type="date" value={alternativeToDate} onChange={(e) => setAlternativeToDate(e.target.value)} className="h-10 rounded-xl border-input bg-background text-xs focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <Input
                type="number"
                min={1}
                value={alternativeMembers}
                onChange={(e) => setAlternativeMembers(Number(e.target.value) || 1)}
                className="h-10 rounded-xl border-input bg-background text-xs focus-visible:ring-2 focus-visible:ring-ring md:col-span-2"
                placeholder="Members"
              />
              <Button onClick={sendAlternativeRequest} className="h-10 rounded-xl bg-primary text-primary-foreground transition hover:brightness-105">
                Send Request
              </Button>
              <Button onClick={() => setAlternativeMode("none")} variant="outline" className="h-10 rounded-xl border-border transition hover:bg-secondary">
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-border bg-background/80 p-3 backdrop-blur-md">
        {hasQuickActions ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                type="button"
                onClick={() => onQuickAction?.(action.id)}
                variant="outline"
                className={`h-8 rounded-full px-3 text-xs ${quickActionClass(action.tone)}`}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type your message..."
            className="h-11 flex-1 rounded-xl border-input bg-background focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={sendMessage} className="h-11 gap-1.5 rounded-xl bg-primary px-4 text-primary-foreground transition hover:brightness-105">
            <MessageCircleMore className="h-4 w-4" />
            Send
          </Button>
        </div>

        {showProofUpload ? (
          <div className="mt-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground/85 transition hover:border-accent/50 hover:bg-accent/[0.10] hover:text-accent">
              <UploadCloud className="h-3.5 w-3.5" />
              Upload payment screenshot
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void onProofUpload(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>

      {previewImageUrl ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(26,22,17,0.92)] p-4 backdrop-blur-sm">
          <button
            onClick={() => setPreviewImageUrl(null)}
            className="absolute right-4 top-4 rounded-lg border border-accent/70 bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground transition hover:brightness-105"
          >
            Close
          </button>
          <img src={previewImageUrl} alt="Payment proof full size" className="max-h-[92vh] w-auto max-w-[96vw] rounded-xl object-contain" />
        </div>
      ) : null}
    </div>
  );
}
