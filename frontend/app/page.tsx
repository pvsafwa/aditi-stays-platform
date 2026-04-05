"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getProperties, listBanners, trackBrowsing } from "@/lib/api";
import { getOrCreateVisitorId } from "@/lib/visitor";
import { CampaignBanner, Property } from "@/types";

type ShowcaseBanner = CampaignBanner & {
  property: Property;
};

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

function readPlacement(banner: CampaignBanner): "hero" | "showcase" {
  const placement = typeof banner.metadata?.placement === "string" ? banner.metadata.placement.trim().toLowerCase() : "";
  return placement === "showcase" ? "showcase" : "hero";
}

function readPropertyId(banner: CampaignBanner): string {
  return typeof banner.metadata?.property_id === "string" ? banner.metadata.property_id.trim() : "";
}

function isDirectVideoBanner(item: CampaignBanner): boolean {
  const platform = (item.platform || "").toLowerCase();
  const url = (item.url || "").toLowerCase();
  const mime = typeof item.metadata?.mime_type === "string" ? item.metadata.mime_type.toLowerCase() : "";

  if (platform.includes("local_video")) return true;
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url);
}

export default function HomePage() {
  const router = useRouter();
  const [visitorId, setVisitorId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [banners, setBanners] = useState<CampaignBanner[]>([]);
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisitorId(getOrCreateVisitorId());
  }, []);

  const refreshLanding = useCallback(async () => {
    const [propsResponse, bannerResponse] = await Promise.all([getProperties(), listBanners()]);
    setProperties(((propsResponse.data as any[]) || []).map(normalizeProperty).filter((property) => property.id));
    setBanners(((bannerResponse.data as any[]) || []).map(normalizeBanner).filter((banner) => banner.active));
  }, []);

  useEffect(() => {
    let alive = true;
    void refreshLanding().catch((err) => {
      if (!alive) return;
      setError(err instanceof Error ? err.message : "Failed loading homepage");
    });
    return () => {
      alive = false;
    };
  }, [refreshLanding]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void listBanners()
        .then((response) => {
          setBanners(((response.data as any[]) || []).map(normalizeBanner).filter((banner) => banner.active));
        })
        .catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  const propertyById = useMemo(() => {
    const map = new Map<string, Property>();
    for (const property of properties) {
      map.set(property.id, property);
    }
    return map;
  }, [properties]);

  const heroVideos = useMemo(() => {
    return banners
      .filter((banner) => readPlacement(banner) === "hero")
      .filter(isDirectVideoBanner)
      .map((banner) => banner.url)
      .filter(Boolean);
  }, [banners]);

  const showcaseBanners = useMemo<ShowcaseBanner[]>(() => {
    return banners
      .filter((banner) => readPlacement(banner) === "showcase")
      .filter(isDirectVideoBanner)
      .map((banner) => {
        const propertyId = readPropertyId(banner);
        const property = propertyById.get(propertyId);
        if (!property) return null;
        return { ...banner, property };
      })
      .filter((banner): banner is ShowcaseBanner => Boolean(banner));
  }, [banners, propertyById]);

  const activeHeroVideo = heroVideos[heroVideoIndex] || "";
  const heroFallbackImage = properties[0]?.hero_image || "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85";

  useEffect(() => {
    if (!heroVideos.length) {
      setHeroVideoIndex(0);
      return;
    }
    setHeroVideoIndex((prev) => (prev >= heroVideos.length ? 0 : prev));
  }, [heroVideos]);

  const handleHeroVideoEnded = useCallback(() => {
    if (heroVideos.length <= 1) return;
    setHeroVideoIndex((prev) => (prev + 1) % heroVideos.length);
  }, [heroVideos.length]);

  const openDetails = async (propertyId: string) => {
    if (visitorId) {
      await trackBrowsing(visitorId, propertyId).catch(() => undefined);
    }
    router.push(`/properties/${encodeURIComponent(propertyId)}`);
  };

  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative h-[34vh] min-h-[280px] w-full overflow-hidden md:h-[38vh] md:min-h-[320px]">
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
          <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(4,13,20,0.84)_8%,rgba(4,13,20,0.55)_38%,rgba(4,13,20,0.2)_74%)]" />
        </div>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1480px] items-end px-5 pb-8 md:px-8 md:pb-10">
          <div className="max-w-4xl space-y-5 text-white">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/12 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-white" />
              Crafted escapes for families, couples, and long weekends
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.03] text-white drop-shadow-[0_6px_22px_rgba(2,6,23,0.46)] md:text-6xl lg:text-7xl">
              Not just stays. Signature experiences.
            </h1>
            <p className="max-w-2xl text-sm font-medium text-white/92 drop-shadow-[0_4px_18px_rgba(2,6,23,0.44)] md:text-base">
              Discover handpicked properties, shortlist instantly, and connect with a real concierge for availability and confirmation.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/properties">
                <Button className="h-12 rounded-full bg-accent px-6 text-accent-foreground shadow-[0_12px_36px_-20px_rgba(248,181,0,0.9)]">
                  View All Properties
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 w-full max-w-[1480px] px-5 md:mt-10 md:px-8">
        <div className="relative overflow-hidden rounded-[38px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(83,216,196,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(248,181,0,0.18),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(242,250,251,0.94)_45%,rgba(248,249,251,0.97))] px-5 py-8 shadow-[0_30px_70px_-46px_rgba(8,31,45,0.68)] backdrop-blur-xl md:px-7 md:py-10 dark:bg-[radial-gradient(circle_at_top_left,rgba(83,216,196,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(248,181,0,0.12),transparent_22%),linear-gradient(180deg,rgba(8,31,45,0.96),rgba(10,24,38,0.94)_48%,rgba(10,16,28,0.96))]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 top-24 h-44 w-44 rounded-full bg-mint/18 blur-3xl" />
            <div className="absolute right-[-36px] top-10 h-40 w-40 rounded-full bg-accent/18 blur-3xl" />
            <div className="absolute bottom-[-48px] left-1/3 h-40 w-40 rounded-full bg-sky-200/30 blur-3xl dark:bg-sky-400/10" />
          </div>

          <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-mint">Showcased Stays</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-4xl">Tap the story. Open the stay.</h2>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">
              These highlighted videos are meant to sell the feeling first. If a property catches attention, one click takes the visitor straight to its detail page.
            </p>
          </div>

          {showcaseBanners.length > 0 ? (
            <div className="relative z-10 mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {showcaseBanners.map((banner) => (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => void openDetails(banner.property.id)}
                  className="group w-full text-left"
                >
                  <article className="h-full rounded-[30px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,255,255,0.72))] p-3 shadow-[0_24px_58px_-38px_rgba(8,31,45,0.62)] transition duration-300 group-hover:-translate-y-1 group-hover:border-mint/45 group-hover:shadow-[0_32px_76px_-38px_rgba(8,31,45,0.75)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(8,31,45,0.76))]">
                    <div className="overflow-hidden rounded-[24px] border border-black/5 bg-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:border-white/10">
                      <div className="relative aspect-[4/5] overflow-hidden">
                        <video
                          src={banner.url}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          poster={banner.cover_url || banner.property.hero_image}
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.06)_0%,rgba(2,6,23,0.14)_48%,rgba(2,6,23,0.72)_100%)]" />
                        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/28 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white backdrop-blur-md">
                          <Play className="h-3.5 w-3.5" />
                          Featured
                        </div>
                      </div>
                    </div>

                    <div className="px-1 pb-1 pt-4">
                      <p className="text-lg font-semibold leading-tight text-foreground">{banner.property.public_title || banner.property.id}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 text-mint" />
                        {banner.property.location}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-foreground">₹{banner.property.nightly_price}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-mint/30 bg-mint/8 px-3 py-1 text-foreground transition group-hover:border-mint/45 group-hover:bg-mint/12">
                          Open Property
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </article>
                </button>
              ))}
            </div>
          ) : (
            <div className="relative z-10 mt-8 rounded-3xl border border-border/60 bg-card/70 px-5 py-12 text-center shadow-[0_20px_56px_-40px_rgba(8,31,45,0.65)] backdrop-blur-xl">
              <p className="text-base font-semibold text-foreground">No showcase videos published yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add premium showcase videos from the admin panel and they will appear here automatically.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto mt-16 w-full max-w-[980px] px-5 text-center md:px-8">
        <div className="rounded-[32px] border border-border/60 bg-card/78 px-6 py-10 shadow-[0_24px_60px_-42px_rgba(8,31,45,0.72)] backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.34em] text-mint">Full Catalog</p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Want the full collection?</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
            Browse the complete property list, filters, wishlist, and search experience on the dedicated all-properties page.
          </p>
          <div className="mt-6">
            <Link href="/properties">
              <Button className="h-12 rounded-full bg-accent px-6 text-accent-foreground shadow-[0_12px_36px_-20px_rgba(248,181,0,0.9)]">
                View All Properties
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mx-auto mt-6 w-full max-w-[1480px] rounded-xl border border-rose-300/40 bg-rose-500/10 px-5 py-3 text-sm text-rose-600 md:px-8 dark:text-rose-300">
          {error}
        </div>
      ) : null}
    </main>
  );
}
