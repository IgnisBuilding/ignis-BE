import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSensorThresholdColumns1800000000047 implements MigrationInterface {
  name = 'AddSensorThresholdColumns1800000000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD COLUMN IF NOT EXISTS "warning_threshold" double precision,
      ADD COLUMN IF NOT EXISTS "alert_threshold" double precision;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sensors"
      DROP COLUMN IF EXISTS "alert_threshold",
      DROP COLUMN IF EXISTS "warning_threshold";
    `);
  }
}