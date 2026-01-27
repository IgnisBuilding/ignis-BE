import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeResidentsIntoUsers1800000000001 implements MigrationInterface {
  name = 'MergeResidentsIntoUsers1800000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add new columns to users table (from residents table)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone" character varying,
      ADD COLUMN IF NOT EXISTS "apartment_id" integer,
      ADD COLUMN IF NOT EXISTS "emergency_contact" character varying
    `);

    // Step 2: Add foreign key constraint for apartment_id
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_apartment"
      FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id")
      ON DELETE SET NULL
    `);

    // Step 3: Migrate data from residents to users
    // For residents that have matching email in users, update the user record
    await queryRunner.query(`
      UPDATE "users" u
      SET
        phone = r.phone,
        apartment_id = r.apartment_id,
        emergency_contact = r.emergency_contact
      FROM "residents" r
      WHERE u.email = r.email
    `);

    // Step 4: Insert residents that don't exist in users table
    await queryRunner.query(`
      INSERT INTO "users" (email, password, name, role, is_active, phone, apartment_id, emergency_contact, created_at, updated_at)
      SELECT
        r.email,
        '', -- Empty password, user will need to set it
        r.name,
        'resident',
        r.is_active,
        r.phone,
        r.apartment_id,
        r.emergency_contact,
        r.created_at,
        r.updated_at
      FROM "residents" r
      WHERE NOT EXISTS (
        SELECT 1 FROM "users" u WHERE u.email = r.email
      )
    `);

    // Step 5: Drop the residents table
    await queryRunner.query(`DROP TABLE IF EXISTS "residents" CASCADE`);

    // Step 6: Create index on apartment_id for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_apartment_id" ON "users" ("apartment_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Recreate residents table
    await queryRunner.query(`
      CREATE TABLE "residents" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying NOT NULL,
        "email" character varying NOT NULL UNIQUE,
        "phone" character varying,
        "apartment_id" integer,
        "type" character varying NOT NULL DEFAULT 'resident',
        "is_active" boolean NOT NULL DEFAULT true,
        "emergency_contact" character varying,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_residents_apartment" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id")
      )
    `);

    // Step 2: Migrate resident data back from users
    await queryRunner.query(`
      INSERT INTO "residents" (name, email, phone, apartment_id, type, is_active, emergency_contact, created_at, updated_at)
      SELECT
        name,
        email,
        phone,
        apartment_id,
        'resident',
        is_active,
        emergency_contact,
        created_at,
        updated_at
      FROM "users"
      WHERE role = 'resident' AND apartment_id IS NOT NULL
    `);

    // Step 3: Remove added columns from users
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_apartment_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_apartment"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "phone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "apartment_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emergency_contact"`);
  }
}
