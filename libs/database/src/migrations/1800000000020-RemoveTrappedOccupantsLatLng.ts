import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTrappedOccupantsLatLng1800000000020 implements MigrationInterface {
  name = 'RemoveTrappedOccupantsLatLng1800000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove redundant lat/lng columns since node_id already has geometry
    await queryRunner.query(`ALTER TABLE "trapped_occupants" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "trapped_occupants" DROP COLUMN IF EXISTS "latitude"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the columns
    await queryRunner.query(`ALTER TABLE "trapped_occupants" ADD COLUMN "longitude" numeric(12,8)`);
    await queryRunner.query(`ALTER TABLE "trapped_occupants" ADD COLUMN "latitude" numeric(12,8)`);
  }
}
