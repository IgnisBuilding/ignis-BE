import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Fingerprints Table
 *
 * Stores WiFi fingerprint data collected by the Android app.
 * Used for indoor positioning via KNN matching.
 * No user FK since the Android app is login-free.
 */
export class CreateFingerprintsTable1800000000036 implements MigrationInterface {
  name = 'CreateFingerprintsTable1800000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fingerprints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "building_id" integer NOT NULL,
        "floor_id" integer,
        "x" float NOT NULL,
        "y" float NOT NULL,
        "label" character varying,
        "signals" jsonb NOT NULL DEFAULT '[]',
        "collected_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_fingerprints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fingerprints_building" FOREIGN KEY ("building_id")
          REFERENCES "building"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_fingerprints_floor" FOREIGN KEY ("floor_id")
          REFERENCES "floor"("id") ON DELETE SET NULL
      )
    `);

    // Index for fast lookup by building
    await queryRunner.query(`
      CREATE INDEX "IDX_fingerprints_building_id" ON "fingerprints" ("building_id")
    `);

    // Index for lookup by building + floor
    await queryRunner.query(`
      CREATE INDEX "IDX_fingerprints_building_floor" ON "fingerprints" ("building_id", "floor_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fingerprints_building_floor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fingerprints_building_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fingerprints"`);
  }
}
