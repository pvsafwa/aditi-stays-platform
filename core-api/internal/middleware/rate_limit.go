package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipWindowLimiter struct {
	limit  int
	window time.Duration

	mu         sync.Mutex
	hits       map[string][]time.Time
	lastSweep  time.Time
	sweepEvery time.Duration
}

func NewIPRateLimiter(limit int, window time.Duration) *ipWindowLimiter {
	return &ipWindowLimiter{
		limit:      limit,
		window:     window,
		hits:       make(map[string][]time.Time),
		lastSweep:  time.Now(),
		sweepEvery: window,
	}
}

func (l *ipWindowLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		allowed, retryAfter := l.allow(key)
		if !allowed {
			c.Header("Retry-After", retryAfter.String())
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

func (l *ipWindowLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-l.window)
	if now.Sub(l.lastSweep) >= l.sweepEvery {
		l.sweepLocked(cutoff)
		l.lastSweep = now
	}

	prev := l.hits[key]
	fresh := prev[:0]
	for _, t := range prev {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) == 0 {
		delete(l.hits, key)
	} else {
		l.hits[key] = fresh
	}

	if len(fresh) >= l.limit {
		retry := fresh[0].Add(l.window).Sub(now)
		if retry < time.Second {
			retry = time.Second
		}
		return false, retry.Round(time.Second)
	}

	fresh = append(fresh, now)
	l.hits[key] = fresh
	return true, 0
}

func (l *ipWindowLimiter) sweepLocked(cutoff time.Time) {
	for key, times := range l.hits {
		write := 0
		for _, hitAt := range times {
			if hitAt.After(cutoff) {
				times[write] = hitAt
				write++
			}
		}
		if write == 0 {
			delete(l.hits, key)
			continue
		}
		l.hits[key] = times[:write]
	}
}
