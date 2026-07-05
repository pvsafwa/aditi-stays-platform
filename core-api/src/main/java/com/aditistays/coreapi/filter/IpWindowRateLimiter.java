package com.aditistays.coreapi.filter;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Sliding-window per-key rate limiter, mirroring core-api's Go ipWindowLimiter. */
public class IpWindowRateLimiter {

    public record Result(boolean allowed, long retryAfterSeconds) {
    }

    private final int limit;
    private final Duration window;
    private final Map<String, List<Instant>> hits = new ConcurrentHashMap<>();
    private volatile Instant lastSweep = Instant.now();
    private final Duration sweepEvery;

    public IpWindowRateLimiter(int limit, Duration window) {
        this.limit = limit;
        this.window = window;
        this.sweepEvery = window;
    }

    public synchronized Result allow(String key) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(window);
        if (Duration.between(lastSweep, now).compareTo(sweepEvery) >= 0) {
            sweep(cutoff);
            lastSweep = now;
        }

        List<Instant> fresh = new ArrayList<>();
        for (Instant t : hits.getOrDefault(key, List.of())) {
            if (t.isAfter(cutoff)) {
                fresh.add(t);
            }
        }

        if (fresh.size() >= limit) {
            long retry = Duration.between(now, fresh.get(0).plus(window)).getSeconds();
            hits.put(key, fresh);
            return new Result(false, Math.max(retry, 1));
        }

        fresh.add(now);
        hits.put(key, fresh);
        return new Result(true, 0);
    }

    private void sweep(Instant cutoff) {
        for (Map.Entry<String, List<Instant>> entry : hits.entrySet()) {
            List<Instant> filtered = new ArrayList<>();
            for (Instant t : entry.getValue()) {
                if (t.isAfter(cutoff)) {
                    filtered.add(t);
                }
            }
            if (filtered.isEmpty()) {
                hits.remove(entry.getKey());
            } else {
                hits.put(entry.getKey(), filtered);
            }
        }
    }
}
