package middleware

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type MetricsCollector struct {
	mu sync.RWMutex

	totalRequests int64
	byStatus      map[int]int64
	byRoute       map[string]int64
	latencyMs     map[string]int64
}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{
		byStatus:  make(map[int]int64),
		byRoute:   make(map[string]int64),
		latencyMs: make(map[string]int64),
	}
}

func (m *MetricsCollector) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()

		status := c.Writer.Status()
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}
		lat := time.Since(started).Milliseconds()

		m.mu.Lock()
		m.totalRequests++
		m.byStatus[status]++
		m.byRoute[route]++
		m.latencyMs[route] += lat
		m.mu.Unlock()
	}
}

func (m *MetricsCollector) PrometheusText() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var b strings.Builder
	b.WriteString("# HELP aditi_core_requests_total Total HTTP requests\n")
	b.WriteString("# TYPE aditi_core_requests_total counter\n")
	b.WriteString(fmt.Sprintf("aditi_core_requests_total %d\n", m.totalRequests))

	b.WriteString("# HELP aditi_core_requests_by_status_total Requests by HTTP status\n")
	b.WriteString("# TYPE aditi_core_requests_by_status_total counter\n")
	statuses := make([]int, 0, len(m.byStatus))
	for status := range m.byStatus {
		statuses = append(statuses, status)
	}
	sort.Ints(statuses)
	for _, status := range statuses {
		b.WriteString(fmt.Sprintf("aditi_core_requests_by_status_total{status=\"%d\"} %d\n", status, m.byStatus[status]))
	}

	b.WriteString("# HELP aditi_core_requests_by_route_total Requests by route\n")
	b.WriteString("# TYPE aditi_core_requests_by_route_total counter\n")
	routes := make([]string, 0, len(m.byRoute))
	for route := range m.byRoute {
		routes = append(routes, route)
	}
	sort.Strings(routes)
	for _, route := range routes {
		count := m.byRoute[route]
		avgMs := float64(0)
		if count > 0 {
			avgMs = float64(m.latencyMs[route]) / float64(count)
		}
		escaped := strings.ReplaceAll(route, "\"", "\\\"")
		b.WriteString(fmt.Sprintf("aditi_core_requests_by_route_total{route=\"%s\"} %d\n", escaped, count))
		b.WriteString(fmt.Sprintf("aditi_core_route_avg_latency_ms{route=\"%s\"} %.2f\n", escaped, avgMs))
	}

	return b.String()
}
