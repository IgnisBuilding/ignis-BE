import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowWarningSensorStatus1800000000048 implements MigrationInterface {
  name = 'AllowWarningSensorStatus1800000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT IF EXISTS "CHK_sensors_status"`);
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "CHK_sensors_status"
      CHECK (status IN ('active', 'inactive', 'maintenance', 'faulty', 'offline', 'warning', 'alert'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT IF EXISTS "CHK_sensors_status"`);
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "CHK_sensors_status"
      CHECK (status IN ('active', 'inactive', 'maintenance', 'faulty', 'offline'))
    `);
  }
}