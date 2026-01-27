import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropBlockingHazardIdsColumn1800000000011 implements MigrationInterface {
  name = 'DropBlockingHazardIdsColumn1800000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove the deprecated array column since we now have the junction table
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants" DROP COLUMN IF EXISTS "blocking_hazard_ids"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the array column
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants" ADD COLUMN "blocking_hazard_ids" integer[]
    `);

    // Restore data from junction table
    await queryRunner.query(`
      UPDATE "trapped_occupants" to_table
      SET blocking_hazard_ids = subquery.hazard_ids
      FROM (
        SELECT
          trapped_occupant_id,
          array_agg(hazard_id) as hazard_ids
        FROM "trapped_occupant_blocking_hazards"
        GROUP BY trapped_occupant_id
      ) subquery
      WHERE to_table.id = subquery.trapped_occupant_id
    `);
  }
}
