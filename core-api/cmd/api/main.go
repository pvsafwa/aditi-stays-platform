package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"aditi-stays/core-api/internal/auth"
	"aditi-stays/core-api/internal/config"
	"aditi-stays/core-api/internal/db"
	"aditi-stays/core-api/internal/handler"
	"aditi-stays/core-api/internal/middleware"
	"aditi-stays/core-api/internal/repository"
	"aditi-stays/core-api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	defer pool.Close()

	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Printf("redis connection warning: %v", err)
	}

	repo := repository.New(pool)
	if err := repo.EnsureSchema(context.Background()); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}
	svc := service.New(repo, redisClient, cfg.ChatNotificationChannel, cfg.UserChatTokenSecret)
	sessionManager := auth.NewManager(cfg.AdminSessionSecret)
	h := handler.New(svc, repo, cfg, sessionManager)

	metrics := middleware.NewMetricsCollector()
	globalLimiter := middleware.NewIPRateLimiter(cfg.GlobalRateLimitPerMinute, time.Minute)
	leadLimiter := middleware.NewIPRateLimiter(cfg.LeadRateLimitPerMinute, time.Minute)

	g := gin.New()
	g.Use(gin.Logger())
	g.Use(gin.Recovery())
	g.Use(middleware.RequestID())
	g.Use(middleware.SecurityHeaders())
	g.Use(middleware.CORS(cfg.CORSAllowedOrigins))
	g.Use(globalLimiter.Middleware())
	g.Use(metrics.Middleware())

	g.GET("/metrics", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/plain; version=0.0.4", []byte(metrics.PrometheusText()))
	})

	h.RegisterRoutes(g, middleware.AdminAuth(cfg.AdminAPIToken, cfg.AdminSessionCookieName, sessionManager), leadLimiter.Middleware())

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           g,
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("core-api running on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
