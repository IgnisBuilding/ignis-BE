import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildingImageColumn1800000000049 implements MigrationInterface {
  name = 'AddBuildingImageColumn1800000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "building" ADD COLUMN IF NOT EXISTS "building_image" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "building_image"`);
  }
}
