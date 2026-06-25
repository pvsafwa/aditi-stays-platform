"use client";

import { useMemo } from "react";
import { CampaignBanner } from "@/types";

type BannerKind = "youtube" | "instagram" | "local_video" | "image";

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;

      const parts = parsed.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];

      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

function normalizeInstagramEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const cleanedPath = parsed.pathname.replace(/\/+$/, "");
    return `https://www.instagram.com${cleanedPath}/embed`;
  } catch {
    return null;
  }
}

function detectKind(banner: CampaignBanner): { kind: BannerKind; src: string } {
  const platform = (banner.platform || "").toLowerCase();
  const url = banner.url || "";

  if (platform.includes("youtube")) {
    const id = extractYouTubeId(url);
    if (id) {
      return {
        kind: "youtube",
        src: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&controls=0&loop=1&playlist=${id}&modestbranding=1`,
      };
    }
  }

  if (platform.includes("instagram")) {
    const embed = normalizeInstagramEmbed(url);
    if (embed) return { kind: "instagram", src: embed };
  }

  if (platform.includes("local_video") || /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url)) {
    return { kind: "local_video", src: url };
  }

  return {
    kind: "image",
    src: banner.cover_url || "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
  };
}

export default function BannerShowcase({ banners }: { banners: CampaignBanner[] }) {
  const rows = useMemo(() => (banners || []).filter((item) => item.active), [banners]);

  if (rows.length === 0) return null;

  return (
    <section className="relative">
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {rows.map((banner, index) => {
          const media = detectKind(banner);

          return (
            <article
              key={`${banner.id}-${index}`}
              className="group relative min-w-[74%] snap-start overflow-hidden rounded-2xl bg-transparent shadow-luxe transition duration-500 hover:-translate-y-0.5 sm:min-w-[52%] md:min-w-[calc((100%-3rem)/4)]"
            >
              <div className="relative h-52 w-full overflow-hidden bg-muted md:h-56">
                {media.kind === "youtube" ? (
                  <iframe
                    src={media.src}
                    title={banner.title}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : media.kind === "instagram" ? (
                  <iframe
                    src={media.src}
                    title={banner.title}
                    className="h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : media.kind === "local_video" ? (
                  <video
                    src={media.src}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={media.src}
                    alt={banner.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(26,22,17,0.72)] via-[rgba(26,22,17,0.2)] to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <p className="font-display line-clamp-1 text-base font-medium leading-snug text-white drop-shadow">{banner.title}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-accent/90">{banner.platform}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {rows.length > 3 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Swipe horizontally for more campaign reels.</p>
      ) : null}
    </section>
  );
}
