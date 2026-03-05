import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add node_id to fingerprints table
 *
 * Links fingerprints to navigation nodes for node-based indoor positioning.
 * The Android app uses node_id to snap the position marker to the correct
 * room on the map instead of converting arbitrary x,y coordinates.
 */
export class AddNodeIdToFingerprints1800000000044 implements MigrationInterface {
  name = 'AddNodeIdToFingerprints1800000000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fingerprints"
        ADD COLUMN IF NOT EXISTS "node_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "fingerprints"
        ADD CONSTRAINT "FK_fingerprints_node" FOREIGN KEY ("node_id")
          REFERENCES "nodes"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_fingerprints_node_id" ON "fingerprints" ("node_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fingerprints_node_id"`);
    await queryRunner.query(`ALTER TABLE "fingerprints" DROP CONSTRAINT IF EXISTS "FK_fingerprints_node"`);
    await queryRunner.query(`ALTER TABLE "fingerprints" DROP COLUMN IF EXISTS "node_id"`);
  }
}
