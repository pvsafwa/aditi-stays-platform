package com.aditistays.catalogservice.db;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class CatalogSeeds {

    public record PropertySeed(
            String id,
            String location,
            double nightlyPrice,
            List<String> amenities,
            String heroImage,
            List<String> media,
            String description
    ) {
    }

    public record BannerSeed(
            String title,
            String url,
            String platform,
            String coverUrl,
            Map<String, Object> metadata
    ) {
    }

    private CatalogSeeds() {
    }

    private static String normalizeCatalogToken(String input) {
        StringBuilder b = new StringBuilder();
        for (char c : input.toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                b.append(c);
            }
        }
        return b.isEmpty() ? "Stay" : b.toString();
    }

    public static List<PropertySeed> buildDefaultPropertySeeds() {
        List<PropertySeed> seeds = new ArrayList<>(List.of(
                new PropertySeed(
                        "AD-Munnar-01", "Munnar", 5400,
                        List.of("Mountain View", "Family Suite", "Prayer Area", "Kids Zone", "Breakfast"),
                        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
                        List.of(
                                "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
                                "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
                                "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b"
                        ),
                        "Calm hillside stay focused on family comfort and privacy."
                ),
                new PropertySeed(
                        "AD-Ooty-02", "Ooty", 6200,
                        List.of("Lake Access", "2 Bedroom Unit", "Private Parking", "Family Dining"),
                        "https://images.unsplash.com/photo-1519817650390-64a93db511aa",
                        List.of(
                                "https://images.unsplash.com/photo-1470246973918-29a93221c455",
                                "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b",
                                "https://images.unsplash.com/photo-1501785888041-af3ef285b470"
                        ),
                        "Scenic climate retreat with spacious units for families."
                ),
                new PropertySeed(
                        "AD-Wayanad-03", "Wayanad", 4800,
                        List.of("Forest Edge", "Multi-bed Family Rooms", "Garden", "Campfire (No Music)"),
                        "https://images.unsplash.com/photo-1433086966358-54859d0ed716",
                        List.of(
                                "https://images.unsplash.com/photo-1470770903676-69b98201ea1c",
                                "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
                                "https://images.unsplash.com/photo-1493558103817-58b2924bce98"
                        ),
                        "Nature-focused stay with quiet evenings and safe kids spaces."
                )
        ));

        List<String> locations = List.of(
                "Coorg", "Kodaikanal", "Thekkady", "Vagamon", "Kovalam", "Alleppey", "Varkala",
                "Idukki", "Yercaud", "Pondicherry", "Mahabaleshwar", "Lonavala", "Panchgani",
                "North Goa", "South Goa", "Mysore", "Chikmagalur", "Udupi", "Gokarna", "Rishikesh",
                "Mussoorie", "Nainital", "Shimla", "Manali", "Dharamshala", "Jaipur", "Udaipur",
                "Pushkar", "Matheran", "Kasauli", "Kullu", "Bir Billing", "Auli", "Jodhpur"
        );
        List<List<String>> amenitySets = List.of(
                List.of("Breakfast", "Parking", "WiFi", "Family Lounge", "24x7 Support"),
                List.of("Mountain View", "Bonfire Zone", "Kids Play Area", "Dining Hall"),
                List.of("Lake Access", "Multi-bed Rooms", "Veg Kitchen", "Prayer Space"),
                List.of("Private Balcony", "Hot Water", "Room Service", "Security"),
                List.of("Garden", "Campfire", "Indoor Games", "Family Dining"),
                List.of("Hill Facing", "Guided Local Trips", "Car Parking", "Airport Pickup")
        );
        List<String> images = List.of(
                "https://images.unsplash.com/photo-1470246973918-29a93221c455",
                "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
                "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
                "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
                "https://images.unsplash.com/photo-1493558103817-58b2924bce98",
                "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
                "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
                "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd",
                "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
                "https://images.unsplash.com/photo-1445019980597-93fa8acb246c",
                "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
                "https://images.unsplash.com/photo-1494526585095-c41746248156",
                "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1",
                "https://images.unsplash.com/photo-1455587734955-081b22074882"
        );

        for (int serial = seeds.size() + 1; serial <= 50; serial++) {
            String location = locations.get((serial - 1) % locations.size());
            String locationToken = normalizeCatalogToken(location);
            List<String> amenities = amenitySets.get((serial - 1) % amenitySets.size());
            String hero = images.get((serial - 1) % images.size());
            List<String> media = List.of(
                    images.get(serial % images.size()),
                    images.get((serial + 3) % images.size()),
                    images.get((serial + 7) % images.size())
            );

            seeds.add(new PropertySeed(
                    "AD-%s-%02d".formatted(locationToken, serial),
                    location,
                    4300 + ((serial * 275) % 3900),
                    amenities,
                    hero,
                    media,
                    "Premium %s stay curated for family and group travel with concierge-backed support.".formatted(location)
            ));
        }

        return seeds;
    }

    public static List<BannerSeed> buildDefaultBannerSeeds() {
        return List.of(
                new BannerSeed(
                        "Flower Hero Loop",
                        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                        "LOCAL_VIDEO",
                        "https://images.unsplash.com/photo-1527631746610-bca00a040d60",
                        Map.of("source", "seed_default", "mime_type", "video/mp4")
                ),
                new BannerSeed(
                        "Big Buck Bunny",
                        "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
                        "LOCAL_VIDEO",
                        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
                        Map.of("source", "seed_default", "mime_type", "video/mp4")
                ),
                new BannerSeed(
                        "Elephants Dream",
                        "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
                        "LOCAL_VIDEO",
                        "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
                        Map.of("source", "seed_default", "mime_type", "video/mp4")
                ),
                new BannerSeed(
                        "For Bigger Escapes",
                        "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
                        "LOCAL_VIDEO",
                        "https://images.unsplash.com/photo-1470246973918-29a93221c455",
                        Map.of("source", "seed_default", "mime_type", "video/mp4")
                ),
                new BannerSeed(
                        "For Bigger Fun",
                        "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
                        "LOCAL_VIDEO",
                        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
                        Map.of("source", "seed_default", "mime_type", "video/mp4")
                )
        );
    }
}
