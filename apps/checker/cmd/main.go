package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/openstatushq/openstatus/apps/checker/handlers"

	"github.com/openstatushq/openstatus/apps/checker/pkg/logger"
	"github.com/openstatushq/openstatus/apps/checker/pkg/timescale"
	"github.com/rs/zerolog/log"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-done
		cancel()
	}()

	// environment variables.
	flyRegion := env("FLY_REGION", env("REGION", "local"))
	cronSecret := env("CRON_SECRET", "")
	timescaleUrl := env("TIMESCALE_URL", env("DATABASE_URL", ""))
	logLevel := env("LOG_LEVEL", "warn")
	cloudProvider := env("CLOUD_PROVIDER", "fly")

	logger.Configure(logLevel)

	// packages.
	httpClient := &http.Client{
		Timeout: 45 * time.Second,
	}

	defer httpClient.CloseIdleConnections()

	timescaleClient, err := timescale.NewClient(timescaleUrl)
	if err != nil {
		log.Ctx(ctx).Fatal().Err(err).Msg("failed to connect to TimescaleDB")
	}

	h := &handlers.Handler{
		Secret:          cronSecret,
		CloudProvider:   cloudProvider,
		Region:          flyRegion,
		TimescaleClient: timescaleClient,
	}

	router := gin.New()
	router.POST("/checker", h.HTTPCheckerHandler)
	router.POST("/checker/http", h.HTTPCheckerHandler)
	router.POST("/checker/tcp", h.TCPHandler)
	router.POST("/ping/:region", h.PingRegionHandler)
	router.POST("/tcp/:region", h.TCPHandlerRegion)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong", "fly_region": flyRegion})
	})

	httpServer := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%s", env("PORT", "8080")),
		Handler: router,
	}

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Ctx(ctx).Error().Err(err).Msg("failed to start http server")
			cancel()
		}
	}()

	<-ctx.Done()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("failed to shutdown http server")

		return
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}

	return fallback
}
