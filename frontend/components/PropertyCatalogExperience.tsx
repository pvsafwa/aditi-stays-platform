"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Heart, MapPin, Search, SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addWishlistItem,
  getProperties,
  getPropertyFeedbackSummary,
  getWishlist,
  listBanners,
  removeWishlistItem,
  trackBrowsing,
} from "@/lib/api";
import { getOrCreateVisitorId } from "@/lib/visitor";
import { CampaignBanner, Property, PropertyFeedbackSummary } from "@/types";

type SortOption = "recommended" | "price_low_high" | "price_high_low" | "rating_high_low" | "newest";
type FamilyFilter = "all" | "family_only";

function buildFeedbackMap(rows: PropertyFeedbackSummary[]): Record<string, PropertyFeedbackSummary> {
  const map: Record<string, PropertyFeedbackSummary> = {};
  for (const row of rows) {
    map[row.property_id] = row;
  }
  return map;
}

function normalizeProperty(raw: any): Property {
  return {
    id: String(raw?.id || ""),
    public_title: String(raw?.public_title || raw?.id || ""),
    location: String(raw?.location || "Unknown"),
    nightly_price: Number(raw?.nightly_price || 0),
    family_friendly: Boolean(raw?.family_friendly ?? true),
    amenities: Array.isArray(raw?.amenities) ? raw.amenities.map((item: unknown) => String(item)).filter(Boolean) : [],
    hero_image: String(raw?.hero_image || "").trim() || "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    media: Array.isArray(raw?.media) ? raw.media.map((item: unknown) => String(item)).filter(Boolean) : [],
    description: String(raw?.description || ""),
  };
}

function normalizeBanner(raw: any): CampaignBanner {
  return {
    id: Number(raw?.id || 0),
    title: String(raw?.title || "Campaign"),
    url: String(raw?.url || ""),
    platform: String(raw?.platform || "OTHER"),
    cover_url: String(raw?.cover_url || "").trim() || "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
    metadata: raw?.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {},
    active: Boolean(raw?.active ?? true),
    created_at: String(raw?.created_at || ""),
    updated_at: String(raw?.updated_at || ""),
  };
}

function bannerFingerprint(rows: CampaignBanner[]): string {
  return rows.map((item) => `${item.id}:${item.updated_at || ""}:${item.url}`).join("|");
}

function isDirectVideoBanner(item: CampaignBanner): boolean {
  const platform = (item.platform || "").toLowerCase();
  const url = (item.url || "").toLowerCase();
  const mime = typeof item.metadata?.mime_type === "string" ? item.metadata.mime_type.toLowerCase() : "";

  if (platform.includes("local_video")) return true;
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url);
}

function readBannerPlacement(item: CampaignBanner): "hero" | "showcase" {
  const placement = typeof item.metadata?.placement === "string" ? item.metadata.placement.trim().toLowerCase() : "";
  return placement === "showcase" ? "showcase" : "hero";
}

export default function PropertyCatalogExperience() {
  const router = useRouter();
  const [visitorId, setVisitorId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [wishlist, setWishlist] = useState<Property[]>([]);
  const [feedbackByProperty, setFeedbackByProperty] = useState<Record<string, PropertyFeedbackSummary>>({});
  const [banners, setBanners] = useState<CampaignBanner[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [locationFilter, setLocationFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("all");
  const [amenityFilter, setAmenityFilter] = useState("all");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [minRating, setMinRating] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bannerHash, setBannerHash] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    setVisitorId(getOrCreateVisitorId());
  }, []);

  const refreshCore = useCallback(async () => {
    const [props, feedback, bannerResponse] = await Promise.all([getProperties(), getPropertyFeedbackSummary(), listBanners()]);
    const propertyList = ((props.data as any[]) || []).map(normalizeProperty).filter((p) => p.id);
    const bannerList = ((bannerResponse.data as any[]) || []).map(normalizeBanner).filter((b) => b.active);
    setProperties(propertyList);
    setFeedbackByProperty(buildFeedbackMap(feedback.data));
    setBanners(bannerList);
    setBannerHash(bannerFingerprint(bannerList));
  }, []);

  useEffect(() => {
    let alive = true;
    void refreshCore()
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed loading homepage");
      })
      .finally(() => {
        if (!alive) return;
        setInitialLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [refreshCore]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void listBanners()
        .then((res) => {
          const nextList = ((res.data as any[]) || []).map(normalizeBanner).filter((item) => item.active);
          const nextHash = bannerFingerprint(nextList);
          setBannerHash((prev) => {
            if (prev === nextHash) return prev;
            setBanners(nextList);
            return nextHash;
          });
        })
        .catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!visitorId) return;
    void getWishlist(visitorId)
      .then((res) => setWishlist(((res.data as any[]) || []).map(normalizeProperty)))
      .catch(() => undefined);
  }, [visitorId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const wishlistSet = useMemo(() => new Set(wishlist.map((w) => w.id)), [wishlist]);
  const locationOptions = useMemo(() => Array.from(new Set(properties.map((property) => property.location))).sort(), [properties]);
  const amenityOptions = useMemo(() => Array.from(new Set(properties.flatMap((property) => property.amenities || []))).sort(), [properties]);

  const filteredProperties = useMemo(() => {
    const min = minBudget ? Number(minBudget) : 0;
    const max = maxBudget ? Number(maxBudget) : Number.POSITIVE_INFINITY;
    const ratingMin = minRating ? Number(minRating) : 0;
    const term = searchTerm.trim().toLowerCase();

    const base = properties.filter((property) => {
      if (locationFilter !== "all" && property.location !== locationFilter) return false;
      if (familyFilter === "family_only" && !property.family_friendly) return false;
      if (amenityFilter !== "all" && !property.amenities.includes(amenityFilter)) return false;
      if (property.nightly_price < min || property.nightly_price > max) return false;
      if ((feedbackByProperty[property.id]?.avg_rating ?? 0) < ratingMin) return false;
      if (!term) return true;

      return (
        property.id.toLowerCase().includes(term) ||
        property.location.toLowerCase().includes(term) ||
        property.description.toLowerCase().includes(term) ||
        property.amenities.some((amenity) => amenity.toLowerCase().includes(term))
      );
    });

    const rows = [...base];
    if (sortBy === "price_low_high") rows.sort((a, b) => a.nightly_price - b.nightly_price);
    if (sortBy === "price_high_low") rows.sort((a, b) => b.nightly_price - a.nightly_price);
    if (sortBy === "rating_high_low") rows.sort((a, b) => (feedbackByProperty[b.id]?.avg_rating ?? 0) - (feedbackByProperty[a.id]?.avg_rating ?? 0));
    if (sortBy === "newest") rows.sort((a, b) => b.id.localeCompare(a.id));
    if (sortBy === "recommended") {
      rows.sort((a, b) => {
        const aScore = (feedbackByProperty[a.id]?.avg_rating ?? 0) * 100 - a.nightly_price / 100;
        const bScore = (feedbackByProperty[b.id]?.avg_rating ?? 0) * 100 - b.nightly_price / 100;
        return bScore - aScore;
      });
    }
    return rows;
  }, [properties, feedbackByProperty, searchTerm, locationFilter, familyFilter, amenityFilter, minBudget, maxBudget, minRating, sortBy]);

  const refreshWishlist = async () => {
    if (!visitorId) return;
    const data = await getWishlist(visitorId);
    setWishlist(((data.data as any[]) || []).map(normalizeProperty));
  };

  const openDetails = async (propertyId: string) => {
    if (visitorId) {
      await trackBrowsing(visitorId, propertyId).catch(() => undefined);
    }
    router.push(`/properties/${encodeURIComponent(propertyId)}`);
  };

  const toggleWishlist = async (propertyId: string) => {
    if (!visitorId) return;
    try {
      if (wishlistSet.has(propertyId)) {
        await removeWishlistItem(visitorId, propertyId);
        setToast(`Removed: ${propertyId}`);
      } else {
        await addWishlistItem(visitorId, propertyId);
        setToast(`Added: ${propertyId}`);
      }
      await refreshWishlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update shortlist");
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSortBy("recommended");
    setLocationFilter("all");
    setFamilyFilter("all");
    setAmenityFilter("all");
    setMinBudget("");
    setMaxBudget("");
    setMinRating("");
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (locationFilter !== "all") count += 1;
    if (familyFilter !== "all") count += 1;
    if (amenityFilter !== "all") count += 1;
    if (minBudget) count += 1;
    if (maxBudget) count += 1;
    if (minRating) count += 1;
    if (sortBy !== "recommended") count += 1;
    return count;
  }, [locationFilter, familyFilter, amenityFilter, minBudget, maxBudget, minRating, sortBy]);

  const heroVideos = useMemo(() => {
    return banners
      .filter((banner) => readBannerPlacement(banner) === "hero")
      .filter(isDirectVideoBanner)
      .map((banner) => banner.url)
      .filter(Boolean);
  }, [banners]);

  const activeHeroVideo = heroVideos[heroVideoIndex] || "";
  const heroFallbackImage =
    properties[0]?.hero_image || "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";

  useEffect(() => {
    if (!heroVideos.length) {
      setHeroVideoIndex(0);
      return;
    }
    setHeroVideoIndex((prev) => (prev >= heroVideos.length ? 0 : prev));
  }, [heroVideos]);

  const carouselRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const carouselSnapTimers = useRef<Record<string, number>>({});

  const setCarouselRef = useCallback((propertyId: string, node: HTMLDivElement | null) => {
    carouselRefs.current[propertyId] = node;
  }, []);

  const scrollCarouselToIndex = useCallback((propertyId: string, index: number, smooth: boolean) => {
    const node = carouselRefs.current[propertyId];
    if (!node) return;
    const width = Math.max(node.clientWidth, 1);
    const total = node.children.length;
    if (!total) return;
    const nextIndex = Math.max(0, Math.min(total - 1, index));
    node.scrollTo({ left: nextIndex * width, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const nudgeCarousel = useCallback(
    (propertyId: string, delta: number) => {
      const node = carouselRefs.current[propertyId];
      if (!node) return;
      const width = Math.max(node.clientWidth, 1);
      const current = Math.round(node.scrollLeft / width);
      scrollCarouselToIndex(propertyId, current + delta, true);
    },
    [scrollCarouselToIndex]
  );

  const scheduleCarouselSnap = useCallback(
    (propertyId: string) => {
      const existingTimer = carouselSnapTimers.current[propertyId];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      carouselSnapTimers.current[propertyId] = window.setTimeout(() => {
        const node = carouselRefs.current[propertyId];
        if (!node) return;
        const width = Math.max(node.clientWidth, 1);
        const nearestIndex = Math.round(node.scrollLeft / width);
        scrollCarouselToIndex(propertyId, nearestIndex, true);
      }, 120);
    },
    [scrollCarouselToIndex]
  );

  const handleCarouselWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const { deltaX, deltaY } = event;
    const verticalIntent = Math.abs(deltaY) > Math.abs(deltaX) * 1.2;
    if (!verticalIntent) return;

    event.preventDefault();
    window.scrollBy({
      top: deltaY,
      left: 0,
      behavior: "auto",
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(carouselSnapTimers.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const handleHeroVideoEnded = useCallback(() => {
    if (heroVideos.length <= 1) return;
    setHeroVideoIndex((prev) => (prev + 1) % heroVideos.length);
  }, [heroVideos.length]);

  return (
    <main className="relative overflow-x-clip pb-16">
      <section className="relative h-[44vh] min-h-[360px] w-full overflow-visible md:h-[48vh] md:min-h-[400px]">
        <div className="absolute inset-0 overflow-hidden">
          {activeHeroVideo ? (
            <video
              key={`${activeHeroVideo}-${heroVideoIndex}`}
              src={activeHeroVideo}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              playsInline
              preload="metadata"
              loop={heroVideos.length === 1}
              onEnded={handleHeroVideoEnded}
              onError={() => {
                if (heroVideos.length > 1) {
                  setHeroVideoIndex((prev) => (prev + 1) % heroVideos.length);
                }
              }}
            />
          ) : (
            <img
              src={heroFallbackImage}
              alt="Aditi Stays Hero"
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(112deg,rgba(4,13,20,0.76)_8%,rgba(4,13,20,0.44)_42%,rgba(4,13,20,0.2)_74%)] dark:bg-[linear-gradient(112deg,rgba(8,31,45,0.82)_8%,rgba(8,31,45,0.5)_42%,rgba(8,31,45,0.24)_74%)]" />
        </div>

        <header className="absolute left-0 right-0 top-0 z-30 mx-auto flex w-full max-w-[1480px] items-center justify-between px-5 py-5 md:px-8 md:py-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/25 bg-black/18 px-4 py-2 text-white backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-mint shadow-[0_0_0_5px_rgba(83,216,196,0.2)]" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.42em] text-white/95">Aditi Stays</p>
              <p className="text-[11px] text-white/78">Handpicked stays with real concierge</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-white/25 bg-black/18 px-4 py-2 text-xs font-medium text-white backdrop-blur-xl transition hover:bg-black/28"
            >
              Home
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1480px] items-end px-5 pb-16 md:px-8 md:pb-20">
          <div className="max-w-4xl space-y-5 text-white">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/12 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-white" />
              Crafted escapes for families, couples, and long weekends
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.03] text-white drop-shadow-[0_6px_22px_rgba(2,6,23,0.46)] md:text-6xl lg:text-7xl">
              Not just stays. Signature experiences.
            </h1>
            <p
              className="relative z-10 max-w-2xl text-sm font-medium drop-shadow-[0_4px_18px_rgba(2,6,23,0.44)] md:text-base"
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
            >
              Discover handpicked properties, shortlist instantly, and connect with a real concierge for availability and confirmation.
            </p>
          </div>
        </div>

        <div className="absolute bottom-[-40px] left-1/2 z-40 w-[calc(100%-1.25rem)] max-w-[1260px] -translate-x-1/2 md:bottom-[-36px]">
          <div className="grid gap-2 rounded-[26px] border border-white/45 bg-white/92 p-2 shadow-[0_34px_72px_-44px_rgba(8,31,45,0.7)] backdrop-blur-xl dark:border-white/15 dark:bg-card/92 md:grid-cols-[1fr_240px_auto] md:items-center md:rounded-full md:p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search destination, vibe, or property"
                className="h-12 rounded-full border-0 bg-transparent pl-10 text-sm shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-12 rounded-full border-0 bg-muted/60 shadow-none ring-0 focus:ring-0 dark:bg-background/55">
                  <SelectValue placeholder="Choose Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locationOptions.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              onClick={() => setAdvancedOpen(true)}
              className="h-12 rounded-full bg-accent px-7 text-accent-foreground shadow-[0_12px_36px_-20px_rgba(248,181,0,0.9)] transition hover:brightness-105"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-w-3xl border-border/70 bg-white dark:bg-card">
          <DialogHeader>
            <DialogTitle>Refine Your Search</DialogTitle>
            <DialogDescription>Adjust ranking, budget, and stay preferences. Your core search remains active.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1 md:grid-cols-2">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="price_low_high">Price: Low to High</SelectItem>
                <SelectItem value="price_high_low">Price: High to Low</SelectItem>
                <SelectItem value="rating_high_low">Rating: High to Low</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>

            <Select value={familyFilter} onValueChange={(value) => setFamilyFilter(value as FamilyFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Stay Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stays</SelectItem>
                <SelectItem value="family_only">Family Friendly</SelectItem>
              </SelectContent>
            </Select>

            <Select value={amenityFilter} onValueChange={setAmenityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Amenity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Amenities</SelectItem>
                {amenityOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={minRating || "any"} onValueChange={(value) => setMinRating(value === "any" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Min Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="3">3+</SelectItem>
                <SelectItem value="4">4+</SelectItem>
                <SelectItem value="4.5">4.5+</SelectItem>
              </SelectContent>
            </Select>

            <Input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} placeholder="Min ₹" />
            <Input type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} placeholder="Max ₹" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={clearFilters}>
              Reset
            </Button>
            <Button className="bg-accent text-accent-foreground" onClick={() => setAdvancedOpen(false)}>
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mx-auto mt-24 w-full max-w-[1480px] space-y-10 px-5 md:mt-28 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-mint">Featured Collection</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-4xl">Find Your Next Escape</h2>
          </div>
          <p className="text-sm text-muted-foreground">{filteredProperties.length} matching stays</p>
        </div>

        {wishlist.length > 0 ? (
          <div className="rounded-3xl border border-border/60 bg-card/70 px-4 py-4 shadow-[0_20px_56px_-40px_rgba(8,31,45,0.65)] backdrop-blur-xl md:px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Your Shortlisted Stays</p>
              <p className="text-xs text-muted-foreground">{wishlist.length} saved</p>
            </div>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
              {wishlist.map((item) => (
                <article
                  key={item.id}
                  className="group relative min-w-[200px] overflow-hidden rounded-2xl border border-border/60 bg-background/65 shadow-[0_14px_34px_-26px_rgba(8,31,45,0.6)]"
                >
                  <button className="block w-full text-left" onClick={() => void openDetails(item.id)}>
                    <img
                      src={item.hero_image}
                      alt={item.id}
                      loading="lazy"
                      decoding="async"
                      className="h-28 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      onError={(event) => {
                        event.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
                      }}
                    />
                    <div className="p-2">
                      <p className="line-clamp-1 text-xs font-semibold text-foreground">{item.id}</p>
                      <p className="text-[11px] text-muted-foreground">{item.location}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => void toggleWishlist(item.id)}
                    aria-label={`Remove ${item.id} from shortlist`}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-sm dark:bg-base/85"
                  >
                    <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProperties.map((property, idx) => {
            const feedback = feedbackByProperty[property.id];
            const gallery = [property.hero_image, ...(property.media || [])].filter(
              (src, i, arr) => Boolean(src) && arr.indexOf(src) === i
            ).slice(0, 6);

            return (
              <article key={property.id} className="group [content-visibility:auto]">
                <div className="relative overflow-hidden rounded-[28px] shadow-[0_18px_44px_-36px_rgba(8,31,45,0.58)]">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openDetails(property.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openDetails(property.id);
                      }
                    }}
                    className="block w-full cursor-pointer"
                  >
                    <div
                      ref={(node) => setCarouselRef(property.id, node)}
                      onWheel={handleCarouselWheel}
                      onScroll={() => scheduleCarouselSnap(property.id)}
                      className="no-scrollbar flex w-full snap-x snap-mandatory scroll-smooth overflow-x-auto"
                    >
                      {gallery.map((imageUrl, imageIndex) => (
                        <img
                          key={`${property.id}-${imageUrl}-${imageIndex}`}
                          src={imageUrl}
                          alt={`${property.id}-${imageIndex + 1}`}
                          loading={idx < 2 && imageIndex === 0 ? "eager" : "lazy"}
                          decoding="async"
                          className="h-[260px] min-w-full snap-always snap-start object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                          onError={(e) => {
                            e.currentTarget.src = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {gallery.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void nudgeCarousel(property.id, -1);
                        }}
                        className="absolute left-3 top-1/2 z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/42 text-white backdrop-blur-md transition hover:bg-black/60"
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void nudgeCarousel(property.id, 1);
                        }}
                        className="absolute right-3 top-1/2 z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/42 text-white backdrop-blur-md transition hover:bg-black/60"
                        aria-label="Next image"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}

                  <button
                    onClick={() => void toggleWishlist(property.id)}
                    aria-label={wishlistSet.has(property.id) ? "Remove from wishlist" : "Add to wishlist"}
                    className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/86 shadow-md backdrop-blur-md transition-all hover:scale-105 dark:bg-base/86"
                  >
                    <Heart
                      className={`h-5 w-5 transition-colors ${wishlistSet.has(property.id) ? "fill-rose-500 text-rose-500" : "text-slate-700 dark:text-white"}`}
                    />
                  </button>

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="absolute bottom-3 left-4 rounded-full bg-white/18 px-3 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-md">
                    {property.id}
                  </div>
                </div>

                <div className="mt-4 space-y-2 px-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 text-mint" />
                        {property.location}
                      </p>
                      <button
                        onClick={() => void openDetails(property.id)}
                        className="mt-1 text-left text-lg font-semibold text-foreground transition-colors hover:text-mint"
                      >
                        {property.public_title || property.id}
                      </button>
                    </div>
                    <p className="text-lg font-bold text-foreground">₹{property.nightly_price}</p>
                  </div>

                  <p className="line-clamp-2 text-sm text-muted-foreground">{property.description || "-"}</p>

                  <div className="flex items-center justify-between pt-1">
                    <p className="flex items-center gap-1 text-sm text-mint">
                      <Star className="h-4 w-4 fill-mint text-mint" />
                      {feedback ? feedback.avg_rating.toFixed(1) : "0.0"}
                      <span className="text-xs text-muted-foreground">({feedback?.review_count ?? 0})</span>
                    </p>
                    <button
                      onClick={() => void openDetails(property.id)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-foreground/85 transition-colors hover:text-mint"
                    >
                      Explore
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {initialLoaded && filteredProperties.length === 0 ? (
          <div className="rounded-3xl border border-border/60 bg-card/70 px-5 py-10 text-center shadow-[0_20px_56px_-40px_rgba(8,31,45,0.65)] backdrop-blur-xl">
            <p className="text-base font-semibold text-foreground">No stays match this filter</p>
            <p className="mt-1 text-sm text-muted-foreground">Try reducing filters or switch to another location.</p>
            <Button onClick={clearFilters} className="mt-4 rounded-full bg-accent px-5 text-accent-foreground">
              Reset Filters
            </Button>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="mx-auto mt-6 w-full max-w-[1480px] rounded-xl border border-rose-300/40 bg-rose-500/10 px-5 py-3 text-sm text-rose-600 dark:text-rose-300 md:px-8">
          {error}
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-4 z-50 rounded-full bg-white/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur dark:bg-card/95 dark:text-mint">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
