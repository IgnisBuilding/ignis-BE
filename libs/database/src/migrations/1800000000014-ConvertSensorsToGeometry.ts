import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertSensorsToGeometry1800000000014 implements MigrationInterface {
  name = 'ConvertSensorsToGeometry1800000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add geometry column to sensors
    await queryRunner.query(`
      ALTER TABLE "sensors" ADD COLUMN "geometry" geometry(Point, 3857)
    `);

    // Migrate existing lat/lng data to geometry
    // Note: lat/lng are in EPSG:4326, we need to transform to EPSG:3857
    await queryRunner.query(`
      UPDATE "sensors"
      SET geometry = ST_Transform(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326), 3857)
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    `);

    // Create spatial index on geometry
    await queryRunner.query(`
      CREATE INDEX "IDX_sensors_geometry" ON "sensors" USING GIST ("geometry")
    `);

    // Drop the old lat/lng columns
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "latitude"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "longitude"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add lat/lng columns
    await queryRunner.query(`ALTER TABLE "sensors" ADD COLUMN "latitude" numeric`);
    await queryRunner.query(`ALTER TABLE "sensors" ADD COLUMN "longitude" numeric`);

    // Migrate geometry back to lat/lng (transform from 3857 to 4326)
    await queryRunner.query(`
      UPDATE "sensors"
      SET
        latitude = ST_Y(ST_Transform(geometry, 4326)),
        longitude = ST_X(ST_Transform(geometry, 4326))
      WHERE geometry IS NOT NULL
    `);

    // Drop spatial index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensors_geometry"`);

    // Drop geometry column
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "geometry"`);
  }
}
