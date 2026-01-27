import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlockingHazardsJunctionTable1800000000007 implements MigrationInterface {
  name = 'CreateBlockingHazardsJunctionTable1800000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create the junction table
    await queryRunner.query(`
      CREATE TABLE "trapped_occupant_blocking_hazards" (
        "id" SERIAL PRIMARY KEY,
        "trapped_occupant_id" integer NOT NULL,
        "hazard_id" integer NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tobh_trapped_occupant" FOREIGN KEY ("trapped_occupant_id")
          REFERENCES "trapped_occupants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tobh_hazard" FOREIGN KEY ("hazard_id")
          REFERENCES "hazards"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_tobh_trapped_occupant_hazard" UNIQUE ("trapped_occupant_id", "hazard_id")
      )
    `);

    // Step 2: Create indexes for the junction table
    await queryRunner.query(`
      CREATE INDEX "IDX_tobh_trapped_occupant_id" ON "trapped_occupant_blocking_hazards" ("trapped_occupant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tobh_hazard_id" ON "trapped_occupant_blocking_hazards" ("hazard_id")
    `);

    // Step 3: Migrate existing data from array to junction table (only valid hazard IDs)
    await queryRunner.query(`
      INSERT INTO "trapped_occupant_blocking_hazards" (trapped_occupant_id, hazard_id)
      SELECT
        to_table.id as trapped_occupant_id,
        hazard_id
      FROM "trapped_occupants" to_table,
        unnest(to_table.blocking_hazard_ids) as hazard_id
      WHERE to_table.blocking_hazard_ids IS NOT NULL
        AND array_length(to_table.blocking_hazard_ids, 1) > 0
        AND hazard_id IN (SELECT id FROM hazards)
      ON CONFLICT DO NOTHING
    `);

    // Step 4: Drop the array column (optional - can keep for backward compatibility)
    // Uncomment the following line if you want to remove the array column:
    // await queryRunner.query(`ALTER TABLE "trapped_occupants" DROP COLUMN "blocking_hazard_ids"`);

    // Step 4 (alternative): Keep the array column but mark it as deprecated
    // by adding a comment
    await queryRunner.query(`
      COMMENT ON COLUMN "trapped_occupants"."blocking_hazard_ids"
      IS 'DEPRECATED: Use trapped_occupant_blocking_hazards junction table instead'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Remove the deprecation comment
    await queryRunner.query(`
      COMMENT ON COLUMN "trapped_occupants"."blocking_hazard_ids" IS NULL
    `);

    // Step 2: Migrate data back to array (if array column still exists)
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

    // Step 3: Drop the junction table
    await queryRunner.query(`DROP TABLE IF EXISTS "trapped_occupant_blocking_hazards" CASCADE`);
  }
}
