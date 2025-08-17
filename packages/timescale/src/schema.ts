import { z } from "zod";
import { flyRegions } from "../../db/src/schema/constants";

export const jobTypes = ["http", "tcp", "imcp", "udp", "dns", "ssl"] as const;
export const jobTypeEnum = z.enum(jobTypes);
export type JobType = z.infer<typeof jobTypeEnum>;

export const periods = ["1h", "1d", "3d", "7d", "14d", "45d"] as const;
export const periodEnum = z.enum(periods);
export type Period = z.infer<typeof periodEnum>;

export const triggers = ["cron", "api"] as const;
export const triggerEnum = z.enum(triggers);
export type Trigger = z.infer<typeof triggerEnum>;

export const httpTimingSchema = z.object({
  dnsStart: z.number(),
  dnsDone: z.number(),
  connectStart: z.number(),
  connectDone: z.number(),
  tlsHandshakeStart: z.number(),
  tlsHandshakeDone: z.number(),
  firstByteStart: z.number(),
  firstByteDone: z.number(),
  transferStart: z.number(),
  transferDone: z.number(),
});

export function calculateTiming(obj: z.infer<typeof httpTimingSchema>) {
  if (!obj) return null;

  return {
    dns: obj.dnsDone - obj.dnsStart,
    connect: obj.connectDone - obj.connectStart,
    tls: obj.tlsHandshakeDone - obj.tlsHandshakeStart,
    ttfb: obj.firstByteDone - obj.firstByteStart,
    transfer: obj.transferDone - obj.transferStart,
  };
}

export const timingPhasesSchema = z
  .object({
    dns: z.number(),
    connect: z.number(),
    tls: z.number(),
    ttfb: z.number(),
    transfer: z.number(),
  })
  .nullable()
  .optional();

export const httpResponseSchema = z.object({
  timestamp: z.number(),
  monitorId: z.string(),
  workspaceId: z.string(),
  region: z.enum(flyRegions),
  url: z.string().url(),
  latency: z.number(),
  statusCode: z.number().nullable().optional(),
  error: z.boolean(),
  cronTimestamp: z.number(),
  message: z.string().nullable().optional(),
  timing: httpTimingSchema.nullable().optional(),
  headers: z.record(z.string()).nullable().optional(),
  assertions: z.record(z.any()).nullable().optional(),
  body: z.string().nullable().optional(),
  trigger: z.enum(triggers).nullable().optional(),
});

export const tcpResponseSchema = z.object({
  timestamp: z.number(),
  monitorId: z.string(),
  workspaceId: z.string(),
  region: z.enum(flyRegions),
  uri: z.string().nullable().optional(),
  latency: z.number(),
  error: z.boolean(),
  cronTimestamp: z.number(),
  errorMessage: z.string().nullable().optional(),
  trigger: z.enum(triggers).nullable().optional(),
});

export const auditLogSchema = z.object({
  timestamp: z.number(),
  id: z.string(),
  action: z.string(),
  actor: z.string(),
  targets: z.record(z.any()).nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  version: z.number().optional(),
});