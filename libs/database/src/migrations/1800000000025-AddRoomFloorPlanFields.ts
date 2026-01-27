import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoomFloorPlanFields1800000000025 implements MigrationInterface {
  name = 'AddRoomFloorPlanFields1800000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add area_sqm column to room
    await queryRunner.query(`
      ALTER TABLE "room" ADD COLUMN "area_sqm" numeric(10,2)
    `);

    // Add color column to room
    await queryRunner.query(`
      ALTER TABLE "room" ADD COLUMN "color" character varying(20)
    `);

    // Add centroid geometry column to room
    await queryRunner.query(`
      ALTER TABLE "room" ADD COLUMN "centroid" geometry(Point, 3857)
    `);

    // Create spatial index on centroid
    await queryRunner.query(`
      CREATE INDEX "IDX_room_centroid" ON "room" USING GIST ("centroid")
    `);

    // Calculate and populate area_sqm from existing geometry (if geometry exists)
    // ST_Area returns area in square units of the SRID (meters for 3857)
    await queryRunner.query(`
      UPDATE "room"
      SET area_sqm = ROUND(ST_Area(ST_Transform(geometry, 3857))::numeric, 2)
      WHERE geometry IS NOT NULL AND area_sqm IS NULL
    `);

    // Calculate and populate centroid from existing geometry
    await queryRunner.query(`
      UPDATE "room"
      SET centroid = ST_Centroid(geometry)
      WHERE geometry IS NOT NULL AND centroid IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop spatial index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_room_centroid"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "room" DROP COLUMN IF EXISTS "centroid"`);
    await queryRunner.query(`ALTER TABLE "room" DROP COLUMN IF EXISTS "color"`);
    await queryRunner.query(`ALTER TABLE "room" DROP COLUMN IF EXISTS "area_sqm"`);
  }
}
