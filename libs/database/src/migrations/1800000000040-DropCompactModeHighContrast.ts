import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCompactModeHighContrast1800000000040 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "compact_mode"`);
    await queryRunner.query(`ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "high_contrast"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_settings" ADD COLUMN "compact_mode" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "user_settings" ADD COLUMN "high_contrast" boolean NOT NULL DEFAULT false`);
  }
}
