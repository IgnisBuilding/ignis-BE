import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add city and area columns to building table
 *
 * Used by GET /buildings/grouped endpoint for the Android setup screen
 * cascading selector (city -> area -> building -> floor).
 */
export class AddCityAreaToBuilding1800000000037 implements MigrationInterface {
  name = 'AddCityAreaToBuilding1800000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add city column (nullable — populated from address or manually)
    await queryRunner.query(`
      ALTER TABLE "building"
      ADD COLUMN IF NOT EXISTS "city" character varying
    `);

    // Add area column (nullable — falls back to society.location)
    await queryRunner.query(`
      ALTER TABLE "building"
      ADD COLUMN IF NOT EXISTS "area" character varying
    `);

    // Populate city/area from existing society data where possible
    await queryRunner.query(`
      UPDATE "building" b
      SET area = s.location
      FROM "society" s
      WHERE b.society_id = s.id
        AND b.area IS NULL
        AND s.location IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "area"`);
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "city"`);
  }
}
