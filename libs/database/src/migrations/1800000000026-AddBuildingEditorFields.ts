import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildingEditorFields1800000000026 implements MigrationInterface {
  name = 'AddBuildingEditorFields1800000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add scale_pixels_per_meter for map editor rendering
    await queryRunner.query(`
      ALTER TABLE "building" ADD COLUMN "scale_pixels_per_meter" numeric(12,6)
    `);

    // Add center_lat for building center point
    await queryRunner.query(`
      ALTER TABLE "building" ADD COLUMN "center_lat" numeric(12,8)
    `);

    // Add center_lng for building center point
    await queryRunner.query(`
      ALTER TABLE "building" ADD COLUMN "center_lng" numeric(12,8)
    `);

    // Calculate center_lat and center_lng from existing geometry if available
    // Transform to 4326 (WGS84) for lat/lng values
    await queryRunner.query(`
      UPDATE "building"
      SET
        center_lat = ST_Y(ST_Transform(ST_Centroid(geometry), 4326)),
        center_lng = ST_X(ST_Transform(ST_Centroid(geometry), 4326))
      WHERE geometry IS NOT NULL AND center_lat IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "center_lng"`);
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "center_lat"`);
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "scale_pixels_per_meter"`);
  }
}
