-- Create extension for TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create HTTP monitoring responses table
CREATE TABLE IF NOT EXISTS http_responses (
    time TIMESTAMPTZ NOT NULL,
    monitor_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    region TEXT NOT NULL,
    url TEXT NOT NULL,
    latency INTEGER NOT NULL,
    status_code INTEGER,
    error BOOLEAN NOT NULL DEFAULT FALSE,
    cron_timestamp BIGINT NOT NULL,
    message TEXT,
    timing JSONB,
    headers JSONB,
    assertions JSONB,
    body TEXT,
    trigger TEXT DEFAULT 'cron',
    PRIMARY KEY (time, monitor_id, region)
);

-- Create hypertable for HTTP responses (partitioned by time)
SELECT create_hypertable('http_responses', 'time', chunk_time_interval => INTERVAL '1 day');

-- Create TCP monitoring responses table
CREATE TABLE IF NOT EXISTS tcp_responses (
    time TIMESTAMPTZ NOT NULL,
    monitor_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    region TEXT NOT NULL,
    uri TEXT,
    latency BIGINT NOT NULL,
    error BOOLEAN NOT NULL DEFAULT FALSE,
    cron_timestamp BIGINT NOT NULL,
    error_message TEXT,
    trigger TEXT DEFAULT 'cron',
    PRIMARY KEY (time, monitor_id, region)
);

-- Create hypertable for TCP responses
SELECT create_hypertable('tcp_responses', 'time', chunk_time_interval => INTERVAL '1 day');

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    time TIMESTAMPTZ NOT NULL,
    id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    targets JSONB,
    metadata JSONB,
    version INTEGER DEFAULT 1,
    PRIMARY KEY (time, id)
);

-- Create hypertable for audit logs
SELECT create_hypertable('audit_logs', 'time', chunk_time_interval => INTERVAL '7 days');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_http_responses_monitor_id ON http_responses (monitor_id);
CREATE INDEX IF NOT EXISTS idx_http_responses_workspace_id ON http_responses (workspace_id);
CREATE INDEX IF NOT EXISTS idx_http_responses_region ON http_responses (region);
CREATE INDEX IF NOT EXISTS idx_http_responses_cron_timestamp ON http_responses (cron_timestamp);

CREATE INDEX IF NOT EXISTS idx_tcp_responses_monitor_id ON tcp_responses (monitor_id);
CREATE INDEX IF NOT EXISTS idx_tcp_responses_workspace_id ON tcp_responses (workspace_id);
CREATE INDEX IF NOT EXISTS idx_tcp_responses_region ON tcp_responses (region);
CREATE INDEX IF NOT EXISTS idx_tcp_responses_cron_timestamp ON tcp_responses (cron_timestamp);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor);

-- Create materialized views for common aggregations
-- HTTP daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS http_metrics_daily AS
SELECT 
    time_bucket('1 hour', time) as hour,
    monitor_id,
    region,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE NOT error) as success,
    COUNT(*) FILTER (WHERE error) as error_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency) as p50_latency,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency) as p75_latency,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY latency) as p90_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency) as p99_latency
FROM http_responses 
WHERE time >= NOW() - INTERVAL '24 hours'
GROUP BY hour, monitor_id, region;

-- TCP daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS tcp_metrics_daily AS
SELECT 
    time_bucket('1 hour', time) as hour,
    monitor_id,
    region,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE NOT error) as success,
    COUNT(*) FILTER (WHERE error) as error_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency) as p50_latency,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency) as p75_latency,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY latency) as p90_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency) as p99_latency
FROM tcp_responses 
WHERE time >= NOW() - INTERVAL '24 hours'
GROUP BY hour, monitor_id, region;

-- Data retention policies
SELECT add_retention_policy('http_responses', INTERVAL '90 days');
SELECT add_retention_policy('tcp_responses', INTERVAL '90 days');
SELECT add_retention_policy('audit_logs', INTERVAL '365 days');