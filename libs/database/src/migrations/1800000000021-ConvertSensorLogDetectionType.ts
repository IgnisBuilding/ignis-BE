import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertSensorLogDetectionType1800000000021 implements MigrationInterface {
  name = 'ConvertSensorLogDetectionType1800000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new varchar column
    await queryRunner.query(`
      ALTER TABLE "sensor_log" ADD COLUMN "detection_type_new" character varying
    `);

    // Map existing integer values to string types
    await queryRunner.query(`
      UPDATE "sensor_log"
      SET detection_type_new = CASE detection_type
        WHEN 1 THEN 'smoke'
        WHEN 2 THEN 'heat'
        WHEN 3 THEN 'gas'
        WHEN 4 THEN 'carbon_monoxide'
        WHEN 5 THEN 'flame'
        WHEN 6 THEN 'water_leak'
        WHEN 7 THEN 'motion'
        WHEN 8 THEN 'door_open'
        WHEN 9 THEN 'window_open'
        WHEN 10 THEN 'temperature'
        WHEN 11 THEN 'humidity'
        ELSE 'other'
      END
    `);

    // Drop old column
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN "detection_type"`);

    // Rename new column
    await queryRunner.query(`ALTER TABLE "sensor_log" RENAME COLUMN "detection_type_new" TO "detection_type"`);

    // Make NOT NULL
    await queryRunner.query(`ALTER TABLE "sensor_log" ALTER COLUMN "detection_type" SET NOT NULL`);

    // Add CHECK constraint
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD CONSTRAINT "CHK_sensor_log_detection_type"
      CHECK (detection_type IN ('smoke', 'heat', 'gas', 'carbon_monoxide', 'flame', 'water_leak', 'motion', 'door_open', 'window_open', 'temperature', 'humidity', 'other'))
    `);

    // Add index
    await queryRunner.query(`CREATE INDEX "IDX_sensor_log_detection_type" ON "sensor_log" ("detection_type")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensor_log_detection_type"`);

    // Drop CHECK constraint
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP CONSTRAINT IF EXISTS "CHK_sensor_log_detection_type"`);

    // Add integer column back
    await queryRunner.query(`ALTER TABLE "sensor_log" ADD COLUMN "detection_type_old" integer`);

    // Map back to integers
    await queryRunner.query(`
      UPDATE "sensor_log"
      SET detection_type_old = CASE detection_type
        WHEN 'smoke' THEN 1
        WHEN 'heat' THEN 2
        WHEN 'gas' THEN 3
        WHEN 'carbon_monoxide' THEN 4
        WHEN 'flame' THEN 5
        WHEN 'water_leak' THEN 6
        WHEN 'motion' THEN 7
        WHEN 'door_open' THEN 8
        WHEN 'window_open' THEN 9
        WHEN 'temperature' THEN 10
        WHEN 'humidity' THEN 11
        ELSE 0
      END
    `);

    // Drop varchar column
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP COLUMN "detection_type"`);

    // Rename old column
    await queryRunner.query(`ALTER TABLE "sensor_log" RENAME COLUMN "detection_type_old" TO "detection_type"`);

    // Make NOT NULL
    await queryRunner.query(`ALTER TABLE "sensor_log" ALTER COLUMN "detection_type" SET NOT NULL`);
  }
}
