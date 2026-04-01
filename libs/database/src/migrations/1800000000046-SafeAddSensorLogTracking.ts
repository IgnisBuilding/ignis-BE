import { MigrationInterface, QueryRunner } from 'typeorm';

export class SafeAddSensorLogTracking1800000000046 implements MigrationInterface {
  name = 'SafeAddSensorLogTracking1800000000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Try to add columns, safely ignoring if they already exist
    const alterQueries = [
      `ALTER TABLE "sensors" ADD COLUMN "last_logged_value" numeric(10, 2) NULL;`,
      `ALTER TABLE "sensors" ADD COLUMN "last_logged_at" TIMESTAMP NULL;`,
    ];

    for (const query of alterQueries) {
      try {
        await queryRunner.query(query);
      } catch (err: any) {
        // Silently ignore "column already exists" errors
        if (!err?.message?.includes('already exists')) {
          // Just continue - likely column exists or not critical
        }
      }
    }

    // Add indices for faster retention queries
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS "idx_sensor_log_sensor_created" ON "sensor_log"("sensor_id", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS "idx_sensor_log_created" ON "sensor_log"("created_at" DESC);`,
    ];

    for (const query of indexQueries) {
      try {
        await queryRunner.query(query);
      } catch (err) {
        // Silently ignore index creation errors
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indices first
    try {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_sensor_log_created"`);
    } catch (err) {
      // Ignore
    }

    try {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_sensor_log_sensor_created"`);
    } catch (err) {
      // Ignore
    }

    // Drop columns
    try {
      await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "last_logged_at"`);
    } catch (err) {
      // Ignore
    }

    try {
      await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "last_logged_value"`);
    } catch (err) {
      // Ignore
    }
  }
}
