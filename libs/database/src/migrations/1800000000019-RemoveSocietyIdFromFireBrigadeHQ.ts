import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSocietyIdFromFireBrigadeHQ1800000000019 implements MigrationInterface {
  name = 'RemoveSocietyIdFromFireBrigadeHQ1800000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_hq_society_id"`);

    // Drop the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "fire_brigade_hq"
      DROP CONSTRAINT IF EXISTS "FK_fire_brigade_hq_society"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE "fire_brigade_hq"
      DROP COLUMN IF EXISTS "society_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the column
    await queryRunner.query(`
      ALTER TABLE "fire_brigade_hq"
      ADD COLUMN "society_id" integer
    `);

    // Re-add the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "fire_brigade_hq"
      ADD CONSTRAINT "FK_fire_brigade_hq_society"
      FOREIGN KEY ("society_id") REFERENCES "society"("id") ON DELETE SET NULL
    `);

    // Re-add the index
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_hq_society_id" ON "fire_brigade_hq" ("society_id")`);
  }
}
