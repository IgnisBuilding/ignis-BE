import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildingConfigFields1800000000027 implements MigrationInterface {
  name = 'AddBuildingConfigFields1800000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add configuration columns to building table
    await queryRunner.query(`
      ALTER TABLE "building"
        ADD COLUMN IF NOT EXISTS "total_floors" integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "apartments_per_floor" integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "has_floor_plan" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "floor_plan_updated_at" timestamp without time zone
    `);

    // 2. Make floor geometry nullable (allow creating floors without geometry)
    await queryRunner.query(`
      ALTER TABLE "floor" ALTER COLUMN "geometry" DROP NOT NULL
    `);

    // 3. Make apartment geometry nullable (allow creating apartments without geometry)
    await queryRunner.query(`
      ALTER TABLE "apartment" ALTER COLUMN "geometry" DROP NOT NULL
    `);

    // 3. Update existing buildings: set has_floor_plan=true if they have rooms
    await queryRunner.query(`
      UPDATE "building" b
      SET has_floor_plan = true
      WHERE EXISTS (
        SELECT 1 FROM "floor" f
        JOIN "room" r ON r.floor_id = f.id
        WHERE f.building_id = b.id
      )
    `);

    // 4. Set total_floors based on existing floors
    await queryRunner.query(`
      UPDATE "building" b
      SET total_floors = COALESCE((
        SELECT COUNT(*) FROM "floor" f WHERE f.building_id = b.id
      ), 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "building"
        DROP COLUMN IF EXISTS "total_floors",
        DROP COLUMN IF EXISTS "apartments_per_floor",
        DROP COLUMN IF EXISTS "has_floor_plan",
        DROP COLUMN IF EXISTS "floor_plan_updated_at"
    `);
  }
}
