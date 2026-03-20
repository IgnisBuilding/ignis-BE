import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedArduinoMqSensors1800000000043 implements MigrationInterface {
  name = 'SeedArduinoMqSensors1800000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "sensors" (name, type, value, unit, status, created_at, updated_at, last_reading)
      SELECT 'Arduino MQ-7', 'gas', 0, 'ppm', 'active', NOW(), NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "sensors" WHERE name = 'Arduino MQ-7'
      )
    `);

    await queryRunner.query(`
      INSERT INTO "sensors" (name, type, value, unit, status, created_at, updated_at, last_reading)
      SELECT 'Arduino MQ-5', 'gas', 0, 'ppm', 'active', NOW(), NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM "sensors" WHERE name = 'Arduino MQ-5'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "sensors" WHERE name IN ('Arduino MQ-7', 'Arduino MQ-5')`);
  }
}
