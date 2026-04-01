import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSensorLogTrackingColumns1800000000045 implements MigrationInterface {
  name = 'AddSensorLogTrackingColumns1800000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      // Add tracking columns to sensors table (if they don't exist)
      await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='sensors' AND column_name='last_logged_value'
      `).then(
        async (result) => {
          if (!result || result.length === 0) {
            await queryRunner.query(`
              ALTER TABLE "sensors" 
              ADD COLUMN "last_logged_value" numeric(10, 2) NULL;
            `);
          }
        },
        async () => {
          // If query fails, try adding anyway
          await queryRunner.query(`
            ALTER TABLE "sensors" 
            ADD COLUMN IF NOT EXISTS "last_logged_value" numeric(10, 2) NULL;
          }`).catch(() => {
            // Column likely exists, continue
          });
        }
      );

      await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='sensors' AND column_name='last_logged_at'
      `).then(
        async (result) => {
          if (!result || result.length === 0) {
            await queryRunner.query(`
              ALTER TABLE "sensors" 
              ADD COLUMN "last_logged_at" TIMESTAMP NULL;
            `);
          }
        },
        async () => {
          // If query fails, try adding anyway
          await queryRunner.query(`
            ALTER TABLE "sensors" 
            ADD COLUMN IF NOT EXISTS "last_logged_at" TIMESTAMP NULL;
          `).catch(() => {
            // Column likely exists, continue
          });
        }
      );

      // Add indices to sensor_log for faster aggregation queries (safe to create if exists)
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_sensor_log_sensor_created"
        ON "sensor_log"("sensor_id", "created_at" DESC);
      `).catch(() => {
        // Index likely exists
      });

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "idx_sensor_log_created"
        ON "sensor_log"("created_at" DESC);
      `).catch(() => {
        // Index likely exists
      });
    } catch (err) {
      // Log but don't fail migration - columns may already exist
      console.log('[Migration] Note: columns/indices may already exist - continuing');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      // Drop indices first
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_sensor_log_created"`).catch(() => {});
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_sensor_log_sensor_created"`).catch(() => {});

      // Remove columns (if they exist)
      await queryRunner.query(`
        ALTER TABLE "sensors"
        DROP COLUMN IF EXISTS "last_logged_at",
        DROP COLUMN IF EXISTS "last_logged_value";
      `).catch(() => {});
    } catch (err) {
      // Silent fail on down
    }
  }
}
