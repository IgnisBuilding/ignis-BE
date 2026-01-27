import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSensorLogImprovements1800000000009 implements MigrationInterface {
  name = 'AddSensorLogImprovements1800000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add value column to store the actual sensor reading value
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD COLUMN IF NOT EXISTS "value" numeric(10,2)
    `);

    // Add unit column to store the measurement unit
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD COLUMN IF NOT EXISTS "unit" character varying(20)
    `);

    // Add is_alert column to flag abnormal readings
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD COLUMN IF NOT EXISTS "is_alert" boolean DEFAULT false
    `);

    // Add alert_type column for categorizing alerts
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD COLUMN IF NOT EXISTS "alert_type" character varying(50)
    `);

    // Rename sensor_detection to detection_type for clarity
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      RENAME COLUMN "sensor_detection" TO "detection_type"
    `);

    // Add indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sensor_log_created_at"
      ON "sensor_log" ("created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sensor_log_is_alert"
      ON "sensor_log" ("is_alert")
      WHERE is_alert = true
    `);

    // Add comment explaining the detection_type column
    await queryRunner.query(`
      COMMENT ON COLUMN "sensor_log"."detection_type"
      IS 'Type of detection: 0=normal, 1=smoke, 2=heat, 3=gas, 4=motion, etc.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensor_log_is_alert"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensor_log_created_at"`);

    // Rename column back
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      RENAME COLUMN "detection_type" TO "sensor_detection"
    `);

    // Remove added columns
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN IF EXISTS "alert_type"`);
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN IF EXISTS "is_alert"`);
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN IF EXISTS "unit"`);
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN IF EXISTS "value"`);
  }
}
