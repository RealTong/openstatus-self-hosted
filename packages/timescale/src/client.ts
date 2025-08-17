import { Pool } from "pg";
import { z } from "zod";
import { flyRegions } from "../../db/src/schema/constants";
import {
  httpResponseSchema,
  tcpResponseSchema,
  auditLogSchema,
  timingPhasesSchema,
  triggers,
} from "./schema";

const PUBLIC_CACHE = 300; // 5 * 60 = 300s = 5m
const DEV_CACHE = 10 * 60; // 10m
const REVALIDATE = process.env.NODE_ENV === "development" ? DEV_CACHE : 0;

export class OSTimescale {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  // Insert methods for compatibility
  async insertHttpResponse(data: z.infer<typeof httpResponseSchema>) {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO http_responses (
          time, monitor_id, workspace_id, region, url, latency, 
          status_code, error, cron_timestamp, message, timing, 
          headers, assertions, body, trigger
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          new Date(data.timestamp),
          data.monitorId,
          data.workspaceId,
          data.region,
          data.url,
          data.latency,
          data.statusCode,
          data.error,
          data.cronTimestamp,
          data.message,
          data.timing ? JSON.stringify(data.timing) : null,
          data.headers ? JSON.stringify(data.headers) : null,
          data.assertions ? JSON.stringify(data.assertions) : null,
          data.body,
          data.trigger || 'cron',
        ]
      );
    } finally {
      client.release();
    }
  }

  // Home stats - compatible with Tinybird API
  public get homeStats() {
    const self = this;
    return {
      async query(params: { cronTimestamp?: number; period?: string } = {}) {
        const client = await self.pool.connect();
        try {
          let timeFilter = "";
          const values: any[] = [];
          
          if (params.period) {
            switch (params.period) {
              case "1h":
                timeFilter = "WHERE time >= NOW() - INTERVAL '1 hour'";
                break;
              case "10m":
                timeFilter = "WHERE time >= NOW() - INTERVAL '10 minutes'";
                break;
              case "1d":
                timeFilter = "WHERE time >= NOW() - INTERVAL '1 day'";
                break;
              case "1w":
                timeFilter = "WHERE time >= NOW() - INTERVAL '1 week'";
                break;
              case "1m":
                timeFilter = "WHERE time >= NOW() - INTERVAL '1 month'";
                break;
            }
          }

          const result = await client.query(
            `SELECT COUNT(*) as count FROM http_responses ${timeFilter}
             UNION ALL
             SELECT COUNT(*) as count FROM tcp_responses ${timeFilter}`,
            values
          );
          
          const count = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
          
          return {
            data: [{ count }],
            meta: {},
            rows: 1,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  // HTTP List Daily - compatible with Tinybird API
  public get httpListDaily() {
    const self = this;
    return {
      async query(params: { monitorId: string; fromDate?: number; toDate?: number }) {
        const client = await self.pool.connect();
        try {
          let timeFilter = "time >= NOW() - INTERVAL '24 hours'";
          const values = [params.monitorId];
          
          if (params.fromDate && params.toDate) {
            timeFilter = "time >= $2 AND time <= $3";
            values.push(new Date(params.fromDate), new Date(params.toDate));
          }

          const result = await client.query(
            `SELECT 
              'http' as type,
              NULL as id,
              monitor_id as "monitorId",
              latency,
              status_code as "statusCode", 
              region,
              cron_timestamp as "cronTimestamp",
              EXTRACT(epoch FROM time) * 1000 as timestamp,
              timing,
              CASE 
                WHEN error THEN 'error'
                WHEN status_code >= 400 THEN 'error'
                WHEN status_code >= 300 THEN 'degraded'
                ELSE 'success'
              END as "requestStatus",
              trigger
             FROM http_responses 
             WHERE monitor_id = $1 AND ${timeFilter}
             ORDER BY time DESC`,
            values
          );
          
          return { 
            data: result.rows.map(row => ({
              ...row,
              timing: row.timing ? self.calculateTimingFromJSON(row.timing) : null,
            })),
            meta: {},
            rows: result.rows.length,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  // HTTP Metrics Daily - compatible with Tinybird API  
  public get httpMetricsDaily() {
    const self = this;
    return {
      async query(params: { 
        monitorId: string; 
        interval?: number; 
        regions?: string[] 
      }) {
        const client = await self.pool.connect();
        try {
          let regionFilter = "";
          const values = [params.monitorId];
          
          if (params.regions && params.regions.length > 0) {
            regionFilter = `AND region = ANY($${values.length + 1})`;
            values.push(params.regions);
          }

          const result = await client.query(
            `SELECT 
              COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency), 0) as "p50Latency",
              COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY latency), 0) as "p75Latency",
              COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY latency), 0) as "p90Latency",
              COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency), 0) as "p95Latency",
              COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency), 0) as "p99Latency",
              COUNT(*) as count,
              COUNT(*) FILTER (WHERE NOT error AND status_code < 300) as success,
              COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400) as degraded,
              COUNT(*) FILTER (WHERE error OR status_code >= 400) as error,
              MAX(EXTRACT(epoch FROM time) * 1000) as "lastTimestamp"
             FROM http_responses 
             WHERE monitor_id = $1 AND time >= NOW() - INTERVAL '24 hours' ${regionFilter}`,
            values
          );
          
          const row = result.rows[0] || {
            p50Latency: 0, p75Latency: 0, p90Latency: 0, p95Latency: 0, p99Latency: 0,
            count: 0, success: 0, degraded: 0, error: 0, lastTimestamp: null
          };
          
          return {
            data: [row],
            meta: {},
            rows: 1,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  // HTTP Status Weekly
  public get httpStatusWeekly() {
    const self = this;
    return {
      async query(params: { monitorId: string }) {
        const client = await self.pool.connect();
        try {
          const result = await client.query(
            `SELECT 
              DATE_TRUNC('day', time) as day,
              COUNT(*) as count,
              COUNT(*) FILTER (WHERE NOT error AND status_code < 400) as ok
             FROM http_responses 
             WHERE monitor_id = $1 AND time >= NOW() - INTERVAL '7 days'
             GROUP BY DATE_TRUNC('day', time)
             ORDER BY day`,
            [params.monitorId]
          );
          
          return {
            data: result.rows.map(row => ({
              day: row.day.toISOString(),
              count: parseInt(row.count),
              ok: parseInt(row.ok),
            })),
            meta: {},
            rows: result.rows.length,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  // Get audit logs
  public get getAuditLog() {
    const self = this;
    return {
      async query(params: { monitorId: string; interval?: number }) {
        const client = await self.pool.connect();
        try {
          const intervalDays = params.interval || 30;
          const result = await client.query(
            `SELECT 
              action,
              id,
              metadata,
              EXTRACT(epoch FROM time) * 1000 as timestamp
             FROM audit_logs 
             WHERE time >= NOW() - INTERVAL '${intervalDays} days'
               AND (metadata->>'monitorId' = $1 OR $1 IS NULL)
             ORDER BY time DESC`,
            [params.monitorId]
          );
          
          return {
            data: result.rows.map(row => ({
              ...row,
              metadata: row.metadata || {},
            })),
            meta: {},
            rows: result.rows.length,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  public get httpStatus45d() {
    const self = this;
    return {
      async query(params: { monitorId: string }) {
        const client = await self.pool.connect();
        try {
          const result = await client.query(
            `SELECT 
              EXTRACT(epoch FROM time) * 1000 as timestamp,
              COUNT(*) as count,
              COUNT(*) FILTER (WHERE NOT error AND status_code < 400) as ok,
              COUNT(*) FILTER (WHERE error OR status_code >= 400) as error,
              COUNT(*) FILTER (WHERE status_code >= 300 AND status_code < 400) as degraded
             FROM http_responses
             WHERE monitor_id = $1 AND time >= NOW() - INTERVAL '45 days'
             GROUP BY EXTRACT(epoch FROM time)
             ORDER BY timestamp`,
            [params.monitorId]
          );
          return {
            data: result.rows.map(row => ({
              ...row,
              timestamp: new Date(row.timestamp),
            })),
            meta: {},
            rows: result.rows.length,
            statistics: { elapsed: 0 }
          };
        } finally {
          client.release();
        }
      }
    };
  }

  // Helper method to calculate timing phases from JSON
  private calculateTimingFromJSON(timingJson: string) {
    try {
      const timing = JSON.parse(timingJson);
      return {
        dns: timing.dnsDone - timing.dnsStart,
        connect: timing.connectDone - timing.connectStart,
        tls: timing.tlsHandshakeDone - timing.tlsHandshakeStart,
        ttfb: timing.firstByteDone - timing.firstByteStart,
        transfer: timing.transferDone - timing.transferStart,
      };
    } catch {
      return null;
    }
  }

  async close() {
    await this.pool.end();
  }
}