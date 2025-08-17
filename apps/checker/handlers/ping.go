package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/cenkalti/backoff/v4"
	"github.com/gin-gonic/gin"
	"github.com/openstatushq/openstatus/apps/checker"
	"github.com/openstatushq/openstatus/apps/checker/pkg/timescale"
	"github.com/openstatushq/openstatus/apps/checker/request"
	"github.com/rs/zerolog/log"
)

type PingResponse struct {
	Body        string `json:"body,omitempty"`
	Headers     string `json:"headers,omitempty"`
	Region      string `json:"region"`
	Timing      string `json:"timing,omitempty"`
	RequestId   int64  `json:"requestId,omitempty"`
	WorkspaceId int64  `json:"workspaceId,omitempty"`
	Latency     int64  `json:"latency"`
	Timestamp   int64  `json:"timestamp"`
	StatusCode  int    `json:"statusCode,omitempty"`
}

type Response struct {
	Headers     map[string]string `json:"headers,omitempty"`
	Error       string            `json:"error,omitempty"`
	Body        string            `json:"body,omitempty"`
	Region      string            `json:"region"`
	Tags        []string          `json:"tags,omitempty"`
	RequestId   int64             `json:"requestId,omitempty"`
	WorkspaceId int64             `json:"workspaceId,omitempty"`
	Latency     int64             `json:"latency"`
	Timestamp   int64             `json:"timestamp"`
	Timing      checker.Timing    `json:"timing"`
	Status      int               `json:"status,omitempty"`
}

func (h Handler) PingRegionHandler(c *gin.Context) {
	ctx := c.Request.Context()
	region := c.Param("region")

	if region == "" {
		c.String(http.StatusBadRequest, "region is required")
		return
	}

	fmt.Printf("Start of /ping/%s\n", region)

	if c.GetHeader("Authorization") != fmt.Sprintf("Basic %s", h.Secret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if h.CloudProvider == "fly" {
		if region != h.Region {
			c.Header("fly-replay", fmt.Sprintf("region=%s", region))
			c.String(http.StatusAccepted, "Forwarding request to %s", region)
			return
		}
	}

	//  We need a new client for each request to avoid connection reuse.
	requestClient := &http.Client{
		Timeout: 45 * time.Second,
	}

	defer requestClient.CloseIdleConnections()

	var req request.PingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Ctx(ctx).Error().Err(err).Msg("failed to decode checker request")
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	var res checker.Response

	op := func() error {
		headers := make([]struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}, 0)

		for key, value := range req.Headers {
			headers = append(headers, struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}{Key: key, Value: value})
		}

		input := request.HttpCheckerRequest{
			Headers: headers,
			URL:     req.URL,
			Method:  req.Method,
			Body:    req.Body,
		}

		r, err := checker.Http(c.Request.Context(), requestClient, input)
		if err != nil {
			return fmt.Errorf("unable to ping: %w", err)
		}

		res = r
		res.Region = h.Region

		// Send data to TimescaleDB instead of Tinybird
		if req.RequestId != 0 {
			// Convert timing to the format expected by TimescaleDB
			timingMap := make(map[string]int64)
			timingMap["dnsStart"] = r.Timing.DnsStart
			timingMap["dnsDone"] = r.Timing.DnsDone
			timingMap["connectStart"] = r.Timing.ConnectStart
			timingMap["connectDone"] = r.Timing.ConnectDone
			timingMap["tlsHandshakeStart"] = r.Timing.TlsHandshakeStart
			timingMap["tlsHandshakeDone"] = r.Timing.TlsHandshakeDone
			timingMap["firstByteStart"] = r.Timing.FirstByteStart
			timingMap["firstByteDone"] = r.Timing.FirstByteDone
			timingMap["transferStart"] = r.Timing.TransferStart
			timingMap["transferDone"] = r.Timing.TransferDone

			statusCodePtr := (*int16)(nil)
			if r.Status != 0 {
				statusCode := int16(r.Status)
				statusCodePtr = &statusCode
			}

			var bodyPtr *string
			if r.Body != "" {
				bodyPtr = &r.Body
			}

			data := timescale.HttpResponse{
				Timestamp:     r.Timestamp,
				MonitorID:     strconv.FormatInt(req.RequestId, 10),
				WorkspaceID:   strconv.FormatInt(req.WorkspaceId, 10),
				Region:        h.Region,
				URL:           req.URL,
				Latency:       int32(r.Latency),
				StatusCode:    statusCodePtr,
				Error:         r.Error != "",
				CronTimestamp: r.Timestamp,
				Message:       nil,
				Timing:        timingMap,
				Headers:       r.Headers,
				Body:          bodyPtr,
				Trigger:       "api",
			}

			if err := h.TimescaleClient.InsertHttpResponse(data); err != nil {
				log.Ctx(ctx).Error().Err(err).Msg("failed to send event to TimescaleDB")
			}
		}

		return nil
	}

	if err := backoff.Retry(op, backoff.WithMaxRetries(backoff.NewExponentialBackOff(), 3)); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "url not reachable"})
		return
	}

	c.JSON(http.StatusOK, res)
}
