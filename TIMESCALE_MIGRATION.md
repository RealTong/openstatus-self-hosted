# OpenStatus TimescaleDB Migration Guide

This document outlines the complete migration process from Tinybird to TimescaleDB for OpenStatus.

## Prerequisites

- PostgreSQL with TimescaleDB extension installed
- Node.js and npm/pnpm
- Go 1.21+
- Access to your current Tinybird data (optional for data migration)

## Migration Steps

### 1. Database Setup

First, create a TimescaleDB database and run the migration script:

```bash
# Make the migration script executable
chmod +x migrate-to-timescale.sh

# Set environment variables
export TIMESCALE_URL="postgresql://user:password@localhost:5432/openstatus"
export TINYBIRD_TOKEN="your_tinybird_token" # For data export if needed

# Run migration
./migrate-to-timescale.sh
```

### 2. Environment Variables

Update your environment variables in all applications:

**Replace:**
- `TINYBIRD_TOKEN` → `TIMESCALE_URL`
- `TINY_BIRD_API_KEY` → `TIMESCALE_URL`

**Example .env:**
```env
# Old Tinybird config
# TINYBIRD_TOKEN=your_token
# TINY_BIRD_API_KEY=your_token

# New TimescaleDB config
TIMESCALE_URL=postgresql://user:password@localhost:5432/openstatus
DATABASE_URL=postgresql://user:password@localhost:5432/openstatus
```

### 3. Package Dependencies

Update package.json files to use the new TimescaleDB package:

```json
{
  "dependencies": {
    "@openstatus/timescale": "workspace:*"
  }
}
```

Remove the old Tinybird dependency:
```json
{
  "dependencies": {
    "@openstatus/tinybird": "workspace:*" // Remove this
  }
}
```

### 4. Import Changes

Update your imports across the codebase:

**Before:**
```typescript
import { OSTinybird } from "@openstatus/tinybird";
```

**After:**
```typescript
import { OSTimescale } from "@openstatus/timescale";
```

### 5. Data Schema Differences

The TimescaleDB implementation maintains compatibility with the Tinybird API but uses different internal data structures:

**Key Changes:**
- Timing data stored as JSONB instead of strings
- Boolean error field instead of numeric
- Timestamps stored as PostgreSQL TIMESTAMPTZ
- Regional data uses standard PostgreSQL arrays

### 6. API Compatibility

The TimescaleDB client maintains the same API interface as Tinybird:

```typescript
// Both work the same way
const metrics = await tb.httpMetricsDaily.query({ monitorId: "123" });
const status = await tb.httpStatusWeekly.query({ monitorId: "123" });
```

### 7. Performance Optimizations

TimescaleDB provides several performance benefits:

- **Time-based partitioning**: Automatic data partitioning by time intervals
- **Data retention**: Automatic cleanup of old data (configurable)
- **Indexing**: Optimized indexes for monitoring queries
- **Materialized views**: Pre-computed aggregations for faster queries

## Deployment

### Docker

Update your Docker Compose or Kubernetes configurations:

```yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_DB: openstatus
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  app:
    environment:
      TIMESCALE_URL: postgresql://postgres:password@timescaledb:5432/openstatus
```

### Production Checklist

- [ ] TimescaleDB database created with proper extensions
- [ ] Migration script executed successfully
- [ ] Environment variables updated
- [ ] Dependencies updated in all packages
- [ ] Import statements updated
- [ ] Application tested thoroughly
- [ ] Monitoring and alerting configured
- [ ] Backup strategy in place

## Rollback Plan

If you need to rollback to Tinybird:

1. Revert environment variables
2. Restore original package.json dependencies
3. Revert import statements
4. Redeploy application

The original Tinybird configuration files are preserved for rollback purposes.

## Troubleshooting

### Common Issues

1. **Connection errors**: Verify TIMESCALE_URL format and database accessibility
2. **Schema errors**: Ensure TimescaleDB extension is installed
3. **Query timeouts**: Check database performance and indexing
4. **Data type errors**: Verify data transformation in client code

### Performance Tuning

```sql
-- Check TimescaleDB chunks
SELECT * FROM timescaledb_information.chunks;

-- Monitor query performance
SELECT * FROM timescaledb_information.job_stats;

-- Adjust retention policy if needed
SELECT add_retention_policy('http_responses', INTERVAL '180 days');
```

## Benefits of Migration

1. **Cost Reduction**: No per-query pricing like Tinybird
2. **Data Control**: Full control over your monitoring data
3. **Scalability**: Better horizontal scaling with TimescaleDB
4. **Integration**: Native PostgreSQL ecosystem integration
5. **Flexibility**: Custom queries and advanced analytics

## Support

For issues during migration:

1. Check the logs in the TimescaleDB and application containers
2. Verify database connectivity and permissions
3. Ensure all environment variables are correctly set
4. Review the migration script output for errors

The migration maintains full API compatibility, so your existing monitoring dashboards and alerts should continue working without changes.