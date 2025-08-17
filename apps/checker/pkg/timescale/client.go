package timescale

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lib/pq"
	_ "github.com/lib/pq"
)

type Client interface {
	InsertHttpResponse(data HttpResponse) error
	InsertTcpResponse(data TcpResponse) error
	InsertAuditLog(data AuditLog) error
	Close() error
}

type client struct {
	db *sql.DB
}

type HttpResponse struct {
	Timestamp      int64             `json:"timestamp"`
	MonitorID      string            `json:"monitorId"`
	WorkspaceID    string            `json:"workspaceId"`
	Region         string            `json:"region"`
	URL            string            `json:"url"`
	Latency        int32             `json:"latency"`
	StatusCode     *int16            `json:"statusCode,omitempty"`
	Error          bool              `json:"error"`
	CronTimestamp  int64             `json:"cronTimestamp"`
	Message        *string           `json:"message,omitempty"`
	Timing         map[string]int64  `json:"timing,omitempty"`
	Headers        map[string]string `json:"headers,omitempty"`
	Assertions     map[string]any    `json:"assertions,omitempty"`
	Body           *string           `json:"body,omitempty"`
	Trigger        string            `json:"trigger,omitempty"`
}

type TcpResponse struct {
	Timestamp      int64   `json:"timestamp"`
	MonitorID      string  `json:"monitorId"`
	WorkspaceID    string  `json:"workspaceId"`
	Region         string  `json:"region"`
	URI            *string `json:"uri,omitempty"`
	Latency        int64   `json:"latency"`
	Error          bool    `json:"error"`
	CronTimestamp  int64   `json:"cronTimestamp"`
	ErrorMessage   *string `json:"errorMessage,omitempty"`
	Trigger        string  `json:"trigger,omitempty"`
}

type AuditLog struct {
	Timestamp int64          `json:"timestamp"`
	ID        string         `json:"id"`
	Action    string         `json:"action"`
	Actor     string         `json:"actor"`
	Targets   map[string]any `json:"targets,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	Version   int            `json:"version,omitempty"`
}

func NewClient(connectionString string) (Client, error) {
	db, err := sql.Open("postgres", connectionString)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to TimescaleDB: %w", err)
	}

	// Test the connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping TimescaleDB: %w", err)
	}

	return &client{db: db}, nil
}

func (c *client) InsertHttpResponse(data HttpResponse) error {
	// Convert timing to JSON
	var timingJSON *string
	if data.Timing != nil {
		timingBytes, err := json.Marshal(data.Timing)
		if err != nil {
			return fmt.Errorf("failed to marshal timing: %w", err)
		}
		timingStr := string(timingBytes)
		timingJSON = &timingStr
	}

	// Convert headers to JSON
	var headersJSON *string
	if data.Headers != nil {
		headersBytes, err := json.Marshal(data.Headers)
		if err != nil {
			return fmt.Errorf("failed to marshal headers: %w", err)
		}
		headersStr := string(headersBytes)
		headersJSON = &headersStr
	}

	// Convert assertions to JSON
	var assertionsJSON *string
	if data.Assertions != nil {
		assertionsBytes, err := json.Marshal(data.Assertions)
		if err != nil {
			return fmt.Errorf("failed to marshal assertions: %w", err)
		}
		assertionsStr := string(assertionsBytes)
		assertionsJSON = &assertionsStr
	}

	trigger := data.Trigger
	if trigger == "" {
		trigger = "cron"
	}

	_, err := c.db.Exec(`
		INSERT INTO http_responses (
			time, monitor_id, workspace_id, region, url, latency, 
			status_code, error, cron_timestamp, message, timing, 
			headers, assertions, body, trigger
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
		time.UnixMilli(data.Timestamp),
		data.MonitorID,
		data.WorkspaceID,
		data.Region,
		data.URL,
		data.Latency,
		data.StatusCode,
		data.Error,
		data.CronTimestamp,
		data.Message,
		timingJSON,
		headersJSON,
		assertionsJSON,
		data.Body,
		trigger,
	)

	return err
}

func (c *client) InsertTcpResponse(data TcpResponse) error {
	trigger := data.Trigger
	if trigger == "" {
		trigger = "cron"
	}

	_, err := c.db.Exec(`
		INSERT INTO tcp_responses (
			time, monitor_id, workspace_id, region, uri, latency, 
			error, cron_timestamp, error_message, trigger
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		time.UnixMilli(data.Timestamp),
		data.MonitorID,
		data.WorkspaceID,
		data.Region,
		data.URI,
		data.Latency,
		data.Error,
		data.CronTimestamp,
		data.ErrorMessage,
		trigger,
	)

	return err
}

func (c *client) InsertAuditLog(data AuditLog) error {
	// Convert targets to JSON
	var targetsJSON *string
	if data.Targets != nil {
		targetsBytes, err := json.Marshal(data.Targets)
		if err != nil {
			return fmt.Errorf("failed to marshal targets: %w", err)
		}
		targetsStr := string(targetsBytes)
		targetsJSON = &targetsStr
	}

	// Convert metadata to JSON
	var metadataJSON *string
	if data.Metadata != nil {
		metadataBytes, err := json.Marshal(data.Metadata)
		if err != nil {
			return fmt.Errorf("failed to marshal metadata: %w", err)
		}
		metadataStr := string(metadataBytes)
		metadataJSON = &metadataStr
	}

	version := data.Version
	if version == 0 {
		version = 1
	}

	_, err := c.db.Exec(`
		INSERT INTO audit_logs (
			time, id, action, actor, targets, metadata, version
		) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		time.UnixMilli(data.Timestamp),
		data.ID,
		data.Action,
		data.Actor,
		targetsJSON,
		metadataJSON,
		version,
	)

	return err
}

func (c *client) Close() error {
	return c.db.Close()
}