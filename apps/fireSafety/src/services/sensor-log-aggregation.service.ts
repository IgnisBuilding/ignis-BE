import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SensorLog } from '@app/entities';

/**
 * Service to manage sensor_log data retention and aggregation.
 * 
 * Strategy:
 * 1. Keep all recent logs (< retention window) as-is for detail queries
 * 2. Aggregate older logs into hourly/daily buckets
 * 3. Delete extremely old data (optional, configurable)
 * 4. Always preserve alert logs regardless of age
 */
@Injectable()
export class SensorLogAggregationService {
  private readonly logger = new Logger(SensorLogAggregationService.name);
  private lastAggregationTime: number = 0;
  private lastAggregationLogTime: number = 0; // Log stats only periodically

  constructor(
    @InjectRepository(SensorLog)
    private sensorLogRepository: Repository<SensorLog>,
    private dataSource: DataSource,
  ) {}

  /**
   * Run aggregation job hourly
   * Can be adjusted or disabled via env var
   */
  @Cron(CronExpression.EVERY_HOUR)
  async aggregateOldLogs(): Promise<void> {
    const enabled = process.env.SENSOR_LOG_AGGREGATION_ENABLED !== 'false'; // Default true
    if (!enabled) {
      return;
    }

    const debugMode = process.env.SENSOR_LOG_DEBUG === 'true';

    try {
      const startTime = Date.now();

      // Get retention window (default 7 days)
      const retentionDays = parseInt(process.env.SENSOR_LOG_RETENTION_DAYS || '7');
      const archiveDays = parseInt(process.env.SENSOR_LOG_ARCHIVE_DAYS || '30'); // After 30 days, aggregate

      const now = new Date();
      const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      const archiveCutoff = new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000);

      if (debugMode) {
        this.logger.debug(
          `Aggregation thresholds: retention=${retentionDays}d, archive=${archiveDays}d`
        );
      }

      // Step 1: Aggregate logs between retention_cutoff and archive_cutoff into hourly buckets
      const aggregatedCount = await this.aggregateToHourly(retentionCutoff, archiveCutoff, debugMode);

      // Step 2: Delete extremely old logs (but preserve alerts)
      const deleteAfterDays = parseInt(process.env.SENSOR_LOG_DELETE_AFTER_DAYS || '90');
      const deleteCutoff = new Date(now.getTime() - deleteAfterDays * 24 * 60 * 60 * 1000);
      const deletedCount = await this.deleteOldNonAlerts(deleteCutoff, debugMode);

      const duration = Date.now() - startTime;

      // Log aggregation stats only every 6 hours to reduce noise
      const now_ms = Date.now();
      if (now_ms - this.lastAggregationLogTime > 6 * 60 * 60 * 1000) {
        this.logger.log(
          `Aggregation completed: ${aggregatedCount} bucketed, ${deletedCount} purged (${duration}ms)`
        );
        this.lastAggregationLogTime = now_ms;
      }
    } catch (err) {
      this.logger.error(`Aggregation failed: ${(err as Error).message}`);
    }
  }

  /**
   * Aggregate logs in the middle age range (retention_cutoff to archive_cutoff)
   * into hourly averages/samples
   */
  private async aggregateToHourly(
    retentionCutoff: Date,
    archiveCutoff: Date,
    debugMode: boolean
  ): Promise<number> {
    try {
      const logsToAggregate = await this.dataSource.query(`
        SELECT * FROM sensor_log
        WHERE created_at < $1 AND created_at >= $2
        ORDER BY sensor_id, created_at
        LIMIT 10000
      `, [retentionCutoff, archiveCutoff]);

      if (logsToAggregate.length === 0) {
        return 0;
      }

      if (debugMode) {
        this.logger.debug(`Aggregating ${logsToAggregate.length} logs into hourly buckets`);
      }

      // Group by sensor_id and hour
      const buckets = new Map<string, any>();

      for (const log of logsToAggregate) {
        const hourStart = new Date(log.created_at);
        hourStart.setMinutes(0, 0, 0);
        const bucketKey = `${log.sensor_id}_${hourStart.getTime()}`;

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, {
            sensor_id: log.sensor_id,
            detection_type: log.detection_type,
            unit: log.unit,
            is_alert: false,
            alert_type: null,
            hour_start: hourStart,
            values: [],
            has_alert: false,
            created_at: hourStart,
            updated_at: new Date(),
          });
        }

        const bucket = buckets.get(bucketKey);
        if (log.value !== null) {
          bucket.values.push(log.value);
        }
        if (log.is_alert) {
          bucket.has_alert = true;
        }
      }

      // Insert aggregated hourly records
      let aggregatedCount = 0;
      for (const bucket of buckets.values()) {
        const avgValue = bucket.values.length > 0
          ? bucket.values.reduce((a: number, b: number) => a + b, 0) / bucket.values.length
          : null;

        try {
          await this.dataSource.query(`
            INSERT INTO sensor_log 
            (sensor_id, detection_type, value, unit, is_alert, alert_type, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
          `, [
            bucket.sensor_id,
            bucket.detection_type,
            avgValue,
            bucket.unit,
            bucket.has_alert,
            bucket.has_alert ? 'aggregated_period_alert' : null,
            bucket.hour_start,
            new Date(),
          ]);

          aggregatedCount++;
        } catch (err) {
          // Silent on individual failures
        }
      }

      // Delete the original logs that were aggregated
      try {
        await this.dataSource.query(`
          DELETE FROM sensor_log
          WHERE created_at < $1 AND created_at >= $2
          AND is_alert = false
          LIMIT 10000
        `, [retentionCutoff, archiveCutoff]);
      } catch (err) {
        // Silent on delete failures
      }

      return aggregatedCount;
    } catch (err) {
      if (debugMode) {
        this.logger.warn(`Aggregation step failed: ${(err as Error).message}`);
      }
      return 0;
    }
  }

  /**
   * Delete very old, non-alert logs to prevent unbounded growth
   */
  private async deleteOldNonAlerts(cutoff: Date, debugMode: boolean): Promise<number> {
    try {
      await this.dataSource.query(`
        DELETE FROM sensor_log
        WHERE created_at < $1 AND is_alert = false
        LIMIT 50000
      `, [cutoff]);

      if (debugMode) {
        this.logger.debug(`Purged old non-alert logs created before ${cutoff.toISOString()}`);
      }

      return 1; // Return count for logging (exact count harder to get)
    } catch (err) {
      if (debugMode) {
        this.logger.error(`Purge failed: ${(err as Error).message}`);
      }
      return 0;
    }
  }

  /**
   * Manual trigger for aggregation (for testing/admin use)
   */
  async triggerAggregationNow(): Promise<{ message: string; timestamp: string }> {
    await this.aggregateOldLogs();
    return { message: 'Aggregation triggered', timestamp: new Date().toISOString() };
  }

  /**
   * Get retention/aggregation statistics
   */
  async getRetentionStats(): Promise<{
    totalLogs: number;
    alertLogs: number;
    recentLogs: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    const retentionDays = parseInt(process.env.SENSOR_LOG_RETENTION_DAYS || '7');
    const cutoffTime = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const [totalLogs] = await this.dataSource.query(
      'SELECT COUNT(*) as count FROM sensor_log'
    );

    const [alertLogs] = await this.dataSource.query(
      'SELECT COUNT(*) as count FROM sensor_log WHERE is_alert = true'
    );

    const [recentLogs] = await this.dataSource.query(
      'SELECT COUNT(*) as count FROM sensor_log WHERE created_at >= $1',
      [cutoffTime]
    );

    const [oldestEntry] = await this.dataSource.query(
      'SELECT MIN(created_at) as oldest FROM sensor_log'
    );

    const [newestEntry] = await this.dataSource.query(
      'SELECT MAX(created_at) as newest FROM sensor_log'
    );

    return {
      totalLogs: parseInt(totalLogs.count, 10),
      alertLogs: parseInt(alertLogs.count, 10),
      recentLogs: parseInt(recentLogs.count, 10),
      oldestEntry: oldestEntry.oldest ? new Date(oldestEntry.oldest) : null,
      newestEntry: newestEntry.newest ? new Date(newestEntry.newest) : null,
    };
  }
}
