package com.aditistays.chatservice.filter;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Sliding-window per-key rate limiter, mirroring chat-service's Python IPRateLimitMiddleware. */
public class IpWindowRateLimiter {

    public record Result(boolean allowed, long retryAfterSeconds) {
    }

    private final int limit;
    private final Duration window;
    private final Map<String, List<Instant>> hits = new ConcurrentHashMap<>();
    private volatile Instant lastSweep = Instant.now();

    public IpWindowRateLimiter(int limit, Duration window) {
        this.limit = Math.max(limit, 1);
        this.window = window;
    }

    public synchronized Result allow(String key) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(window);
        if (Duration.between(lastSweep, now).compareTo(window) >= 0) {
            sweep(cutoff);
            lastSweep = now;
        }

        List<Instant> bucket = hits.computeIfAbsent(key, k -> new ArrayList<>());
        bucket.removeIf(t -> t.isBefore(cutoff));

        if (bucket.size() >= limit) {
            return new Result(false, window.getSeconds());
        }

        bucket.add(now);
        return new Result(true, 0);
    }

    private void sweep(Instant cutoff) {
        for (Map.Entry<String, List<Instant>> entry : hits.entrySet()) {
            entry.getValue().removeIf(t -> t.isBefore(cutoff));
            if (entry.getValue().isEmpty()) {
                hits.remove(entry.getKey());
            }
        }
    }
}
