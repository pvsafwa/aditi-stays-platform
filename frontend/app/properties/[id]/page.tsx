"use client";

import { Minimize2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ChatWindow from "@/components/ChatWindow";
import ComparisonTable from "@/components/ComparisonTable";
import LeadCaptureModal from "@/components/LeadCaptureModal";
import {
  addPropertyFeedback,
  addWishlistItem,
  checkAvailability,
  compareProperties,
  getBrowsingHistory,
  getProperties,
  getPropertyById,
  getPropertyReviews,
  getChatMessagesForUser,
  getWishlist,
  removeWishlistItem,
  sendAutoIntroMessage,
  trackBrowsing,
} from "@/lib/api";
import { getOrCreateVisitorId } from "@/lib/visitor";
import { Property, PropertyReview } from "@/types";

type ActiveChatSnapshot = {
  lead_id: number;
  name: string;
  members: number;
  token: string;
};

function activeChatStorageKey(visitorId: string): string {
  return `aditi:active_chat:${visitorId}`;
}

function readActiveChat(visitorId: string): ActiveChatSnapshot | null {
  const raw = localStorage.getItem(activeChatStorageKey(visitorId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveChatSnapshot>;
    const leadId = Number(parsed.lead_id);
    const token = String(parsed.token || "").trim();
    if (!Number.isFinite(leadId) || leadId <= 0 || token === "") return null;
    return {
      lead_id: leadId,
      name: String(parsed.name || ""),
      members: Number(parsed.members) > 0 ? Number(parsed.members) : 2,
      token,
    };
  } catch {
    return null;
  }
}

function writeActiveChat(visitorId: string, snapshot: ActiveChatSnapshot): void {
  localStorage.setItem(activeChatStorageKey(visitorId), JSON.stringify(snapshot));
}

function clearActiveChat(visitorId: string): void {
  localStorage.removeItem(activeChatStorageKey(visitorId));
}

function normalizeProperty(raw: any): Property {
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
  };
}

function normalizeReviews(raw: any[]): PropertyReview[] {
  return (raw || []).map((item) => ({
    id: Number(item?.id || 0),
    property_id: String(item?.property_id || ""),
    visitor_id: String(item?.visitor_id || ""),
    rating: Number(item?.rating || 0),
    comment: String(item?.comment || ""),
    created_at: String(item?.created_at || new Date().toISOString()),
  }));
}

export default function PropertyDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const propertyId = decodeURIComponent(params.id);

  const [visitorId, setVisitorId] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [wishlist, setWishlist] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<PropertyReview[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [browsedIds, setBrowsedIds] = useState<string[]>([]);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [compareTarget, setCompareTarget] = useState("");
  const [comparisonData, setComparisonData] = useState<Property[]>([]);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatDisplayName, setChatDisplayName] = useState("");
  const [chatMembers, setChatMembers] = useState(2);
  const [chatToken, setChatToken] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisitorId(getOrCreateVisitorId());
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const [propertyResponse, propsResponse, reviewResponse] = await Promise.all([
          getPropertyById(propertyId),
          getProperties(),
          getPropertyReviews(propertyId),
        ]);
        setProperty(normalizeProperty(propertyResponse.data));
        setAllProperties(((propsResponse.data as any[]) || []).map(normalizeProperty));
        setReviews(normalizeReviews((reviewResponse.data as any[]) || []));
        setAvgRating(Number(reviewResponse.summary?.avg_rating || 0));
        setReviewCount(Number(reviewResponse.summary?.review_count || 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed loading property details");
      }
    };
    void boot();
  }, [propertyId]);

  useEffect(() => {
    if (!visitorId) return;
    void getWishlist(visitorId)
      .then((res) => setWishlist(((res.data as any[]) || []).map(normalizeProperty)))
      .catch(() => undefined);
  }, [visitorId]);

  useEffect(() => {
    if (!visitorId) return;
    void getBrowsingHistory(visitorId)
      .then((res) => {
        const ids = ((res.data as Array<{ property_id: string }>) || [])
          .map((item) => item.property_id)
          .filter((id, idx, arr) => arr.indexOf(id) === idx);
        setBrowsedIds(ids);
      })
      .catch(() => undefined);
  }, [visitorId]);

  useEffect(() => {
    if (!visitorId) return;
    void trackBrowsing(visitorId, propertyId).catch(() => undefined);
  }, [visitorId, propertyId]);

  useEffect(() => {
    setSelectedMediaIndex(0);
    setLightboxOpen(false);
    setChatVisible(false);
    setChatUnreadCount(0);
  }, [propertyId]);

  useEffect(() => {
    if (!visitorId) return;
    const activeChat = readActiveChat(visitorId);
    if (!activeChat) {
      setLeadId(null);
      setChatToken("");
      setChatUnreadCount(0);
      return;
    }
    setLeadId(activeChat.lead_id);
    if (activeChat.name) setChatDisplayName(activeChat.name);
    setChatMembers(activeChat.members);
    setChatToken(activeChat.token);
  }, [visitorId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const wishlistSet = useMemo(() => new Set(wishlist.map((w) => w.id)), [wishlist]);
  const compareOptions = useMemo(
    () => allProperties.filter((p) => p.id !== propertyId),
    [allProperties, propertyId]
  );
  const existingVisitorReview = useMemo(
    () => reviews.find((review) => review.visitor_id === visitorId) ?? null,
    [reviews, visitorId]
  );
  const recentlyBrowsed = useMemo(
    () =>
      browsedIds
        .filter((id) => id !== propertyId)
        .map((id) => allProperties.find((item) => item.id === id))
        .filter((item): item is Property => Boolean(item))
        .slice(0, 8),
    [browsedIds, allProperties, propertyId]
  );

  const gallery = useMemo(() => {
    if (!property) return [];
    const merged = [property.hero_image, ...(property.media || [])].filter(Boolean);
    return merged.filter((src, idx) => merged.indexOf(src) === idx);
  }, [property]);

  const activeImage = gallery[selectedMediaIndex] || gallery[0] || "";

  const refreshReviews = async () => {
    const reviewResponse = await getPropertyReviews(propertyId);
    setReviews(normalizeReviews((reviewResponse.data as any[]) || []));
    setAvgRating(Number(reviewResponse.summary?.avg_rating || 0));
    setReviewCount(Number(reviewResponse.summary?.review_count || 0));
  };

  const toggleWishlist = async () => {
    if (!visitorId) return;
    try {
      if (wishlistSet.has(propertyId)) {
        await removeWishlistItem(visitorId, propertyId);
        setToast("Removed from shortlist");
      } else {
        await addWishlistItem(visitorId, propertyId);
        setToast("Added to shortlist");
      }
      const refreshed = await getWishlist(visitorId);
      setWishlist(((refreshed.data as any[]) || []).map(normalizeProperty));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shortlist");
    }
  };

  const runCompare = async () => {
    if (!compareTarget) {
      setToast("Choose another property to compare");
      return;
    }
    try {
      const res = await compareProperties([propertyId, compareTarget]);
      setComparisonData(res.data as Property[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    }
  };

  const submitFeedback = async () => {
    if (!visitorId) return;
    if (existingVisitorReview) {
      setToast("You already submitted feedback for this property.");
      return;
    }
    setFeedbackLoading(true);
    setError(null);
    try {
      await addPropertyFeedback(propertyId, {
        visitor_id: visitorId,
        rating: feedbackRating,
        comment: feedbackComment,
      });
      setFeedbackComment("");
      setFeedbackRating(5);
      await refreshReviews();
      setToast("Feedback submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Feedback submission failed");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const createLead = async (input: {
    customer_name: string;
    mobile_number: string;
    disclaimer_accepted: boolean;
    from_date: string;
    to_date: string;
    members: number;
  }) => {
    if (!visitorId) return;
    if (leadId && chatToken) {
      setLeadModalOpen(false);
      setChatVisible(true);
      setChatUnreadCount(0);
      setToast("Existing chat resumed");
      return;
    }
    const response = await checkAvailability({
      visitor_id: visitorId,
      property_id: propertyId,
      customer_name: input.customer_name,
      mobile_number: input.mobile_number,
      disclaimer_accepted: input.disclaimer_accepted,
      from_date: input.from_date,
      to_date: input.to_date,
      members: input.members,
    });
    const id = Number(response.chat_id || response.data?.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("Invalid chat response. Please try again.");
    }
    const token = String(response.chat_token || "").trim();
    if (!token) {
      throw new Error("Chat session token missing. Please try again.");
    }

    if (!response.resumed_chat) {
      await sendAutoIntroMessage(id, {
        name: input.customer_name,
        property_id: propertyId,
        from_date: input.from_date,
        to_date: input.to_date,
        members: input.members,
      }, token).catch(() => undefined);
    }

    setLeadId(id);
    setChatToken(token);
    setChatDisplayName(input.customer_name);
    setChatMembers(input.members);
    writeActiveChat(visitorId, {
      lead_id: id,
      name: input.customer_name,
      members: input.members,
      token,
    });
    setLeadModalOpen(false);
    setChatVisible(true);
    setChatUnreadCount(0);
    setToast(response.resumed_chat ? "Previous chat resumed" : "Chat started");
  };

  const handleCheckAvailabilityClick = async () => {
    if (leadId && chatToken) {
      try {
        await getChatMessagesForUser(leadId, chatToken);
        setChatVisible(true);
        setChatUnreadCount(0);
        setToast("Existing chat resumed");
        return;
      } catch {
        if (visitorId) {
          clearActiveChat(visitorId);
        }
        setLeadId(null);
        setChatToken("");
        setChatDisplayName("");
        setChatMembers(2);
      }
    }
    setLeadModalOpen(true);
  };

  const handleCloseChat = () => {
    if (visitorId) clearActiveChat(visitorId);
    setChatVisible(false);
    setLeadModalOpen(false);
    setLeadId(null);
    setChatUnreadCount(0);
    setChatToken("");
    setChatDisplayName("");
    setChatMembers(2);
    setToast("Chat closed");
  };

  if (!property) {
    return (
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <p className="rounded-xl border border-border/60 bg-card/80 p-4 text-sm text-muted-foreground shadow-sm">
          {error || "Loading property details..."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8">
      <section className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Link href="/" className="rounded-lg border border-border/60 px-3 py-2 text-foreground/85 hover:bg-background/70">
            All Properties
          </Link>
          <span className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-teal-700">Property ID: {property.id}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={toggleWishlist} className="rounded-lg border border-teal-300 bg-card/80 px-3 py-2 text-xs text-teal-700 hover:bg-teal-50">
            {wishlistSet.has(property.id) ? "Remove Shortlist" : "Add Shortlist"}
          </button>
          <button onClick={() => void handleCheckAvailabilityClick()} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-900">
            Check Availability
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm md:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <button className="block w-full overflow-hidden rounded-xl" onClick={() => setLightboxOpen(true)}>
              <img
                src={activeImage}
                alt={property.id}
                className="h-80 w-full object-cover transition duration-300 hover:scale-[1.02]"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
                }}
              />
            </button>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {gallery.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  onClick={() => setSelectedMediaIndex(idx)}
                  className={`min-w-[92px] overflow-hidden rounded-lg border ${selectedMediaIndex === idx ? "border-teal-500" : "border-border/60"}`}
                >
                  <img
                    src={img}
                    alt={`${property.id}-${idx + 1}`}
                    className="h-16 w-24 object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
                    }}
                  />
                </button>
              ))}
            </div>
            <button onClick={() => setLightboxOpen(true)} className="mt-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/85 hover:bg-background/70">
              View Fullscreen Gallery
            </button>
          </div>

          <div>
            <h1 className="text-3xl font-extrabold text-foreground">{property.id}</h1>
            <p className="mt-1 text-muted-foreground">{property.location}</p>
            <p className="mt-3 text-sm text-foreground/85">{property.description}</p>
            <p className="mt-3 text-lg font-bold text-foreground">₹{property.nightly_price} / night</p>
            <p className="mt-3 text-sm text-teal-700">⭐ {avgRating.toFixed(1)} · {reviewCount} review(s)</p>
            <p className="mt-2 text-xs text-muted-foreground">Chat will be recorded for internal training purposes & compliance.</p>

            <h3 className="mt-4 text-sm font-semibold text-foreground">Amenities</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {property.amenities.map((amenity) => (
                <span key={amenity} className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-foreground/85">
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {recentlyBrowsed.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
          <h2 className="text-base font-bold text-foreground">Recently Browsed by You</h2>
          <p className="text-xs text-muted-foreground">Jump back quickly without losing this page context.</p>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {recentlyBrowsed.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(`/properties/${encodeURIComponent(item.id)}`)}
                className="min-w-[180px] overflow-hidden rounded-xl border border-border/60 bg-background/70 text-left"
              >
                <img
                  src={item.hero_image}
                  alt={item.id}
                  className="h-24 w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
                  }}
                />
                <div className="p-2">
                  <p className="text-xs font-semibold text-foreground">{item.id}</p>
                  <p className="text-xs text-muted-foreground">{item.location}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
        <h2 className="text-lg font-bold text-foreground">Compare from this Property</h2>
        <p className="text-xs text-muted-foreground">Pick one more property to run side-by-side compare.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={compareTarget}
            onChange={(e) => setCompareTarget(e.target.value)}
            className="min-w-[260px] rounded-lg border border-border/60 bg-card/80 px-3 py-2 text-sm text-foreground/85"
          >
            <option value="">Select property to compare</option>
            {compareOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} · {item.location}
              </option>
            ))}
          </select>
          <button onClick={() => void runCompare()} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white">
            Compare Now
          </button>
        </div>
        <div className="mt-3">
          <ComparisonTable properties={comparisonData} />
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-foreground">Write Review</h2>
          <p className="text-xs text-muted-foreground">One review per visitor per property.</p>
          {existingVisitorReview ? (
            <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-700">
              Review already submitted on {new Date(existingVisitorReview.created_at).toLocaleString()}.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                onClick={() => setFeedbackRating(num)}
                disabled={Boolean(existingVisitorReview)}
                className={`rounded-lg px-3 py-2 text-sm ${feedbackRating === num ? "bg-amber-500 text-slate-900" : "border border-border/60 text-foreground/85"}`}
              >
                {num}★
              </button>
            ))}
          </div>
          <textarea
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder="Write your review"
            disabled={Boolean(existingVisitorReview)}
            className="mt-3 h-24 w-full rounded-lg border border-border/60 bg-card/80 p-2 text-sm text-foreground/85"
          />
          <button
            onClick={() => void submitFeedback()}
            disabled={feedbackLoading || Boolean(existingVisitorReview)}
            className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {feedbackLoading ? "Submitting..." : "Submit Review"}
          </button>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
          <h2 className="text-lg font-bold text-foreground">Recent Reviews</h2>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
            {reviews.length === 0 ? <p className="text-muted-foreground">No reviews yet.</p> : null}
            {reviews.map((review) => (
              <article key={review.id} className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-amber-600">{"★".repeat(review.rating)}</p>
                <p className="mt-1 text-foreground/85">{review.comment || "No comment provided."}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(review.created_at).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <LeadCaptureModal propertyId={property.id} open={leadModalOpen} onClose={() => setLeadModalOpen(false)} onSubmit={createLead} />

      {leadId && !chatVisible ? (
        <div className="fixed bottom-2 right-2 z-50 flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-2 py-2 shadow-xl backdrop-blur md:bottom-4 md:right-4">
          <button
            onClick={() => {
              setChatVisible(true);
              setChatUnreadCount(0);
            }}
            className="relative rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
          >
            Open Chat
            {chatUnreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-mint px-1 text-[10px] font-bold text-slate-900">
                {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={handleCloseChat}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-foreground/85 hover:bg-background"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {leadId ? (
        <div
          className={`fixed bottom-2 right-2 z-50 w-[calc(100vw-1rem)] max-w-[430px] transition duration-200 md:bottom-4 md:right-4 md:max-w-[420px] ${
            chatVisible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-3 opacity-0 pointer-events-none"
          }`}
        >
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-teal-700">Recorded Chat</p>
                <p className="text-xs font-semibold text-foreground">Aditi Stays Support</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setChatVisible(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Minimize chat"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={handleCloseChat}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-foreground/85 hover:bg-background"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-2">
              <ChatWindow
                leadId={leadId}
                role="user"
                actor={visitorId || "guest"}
                authToken={chatToken}
                hideLeadId
                userDisplayName={chatDisplayName || "Guest"}
                propertyOptions={allProperties.map((item) => ({ id: item.id, label: `${item.id} · ${item.location}` }))}
                defaultPropertyId={propertyId}
                defaultMembers={chatMembers}
                isVisible={chatVisible}
                onUnreadCountChange={setChatUnreadCount}
              />
            </div>
          </div>
        </div>
      ) : null}

      {lightboxOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/95 p-3">
          <button onClick={() => setLightboxOpen(false)} className="absolute right-4 top-4 rounded-lg border border-border/60 px-3 py-1 text-xs text-white">
            Close
          </button>
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
            <button
              onClick={() => setSelectedMediaIndex((prev) => (prev - 1 + gallery.length) % gallery.length)}
              className="rounded-full border border-border/60 px-3 py-2 text-xs text-white"
            >
              Prev
            </button>
            <img
              src={activeImage}
              alt={property.id}
              className="max-h-[86vh] w-full rounded-xl object-contain"
              onError={(e) => {
                e.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
              }}
            />
            <button
              onClick={() => setSelectedMediaIndex((prev) => (prev + 1) % gallery.length)}
              className="rounded-full border border-border/60 px-3 py-2 text-xs text-white"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
      {toast ? <p className="fixed bottom-4 left-4 z-50 rounded-lg border border-teal-200 bg-card/80 px-3 py-2 text-xs text-teal-700 shadow-sm">{toast}</p> : null}
    </main>
  );
}
