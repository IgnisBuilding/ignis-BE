import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFireBrigadeTables1800000000010 implements MigrationInterface {
  name = 'CreateFireBrigadeTables1800000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create FIRE_BRIGADE_HQ table (Headquarters - top level)
    await queryRunner.query(`
      CREATE TABLE "fire_brigade_hq" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer,
        "society_id" integer,
        "status" character varying NOT NULL DEFAULT 'active',
        "name" character varying NOT NULL,
        "address" character varying,
        "phone" character varying,
        "email" character varying,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_fire_brigade_hq_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_fire_brigade_hq_society" FOREIGN KEY ("society_id")
          REFERENCES "society"("id") ON DELETE SET NULL
      )
    `);

    // 2. Create FIRE_BRIGADE_STATE table (State level - reports to HQ)
    await queryRunner.query(`
      CREATE TABLE "fire_brigade_state" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying NOT NULL,
        "state" character varying NOT NULL,
        "hq_id" integer,
        "status" character varying NOT NULL DEFAULT 'active',
        "address" character varying,
        "phone" character varying,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_fire_brigade_state_hq" FOREIGN KEY ("hq_id")
          REFERENCES "fire_brigade_hq"("id") ON DELETE SET NULL
      )
    `);

    // 3. Create FIRE_BRIGADE table (Local brigade - reports to State)
    await queryRunner.query(`
      CREATE TABLE "fire_brigade" (
        "id" SERIAL PRIMARY KEY,
        "name" character varying NOT NULL,
        "location" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "state_id" integer,
        "address" character varying,
        "phone" character varying,
        "email" character varying,
        "capacity" integer DEFAULT 10,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_fire_brigade_state" FOREIGN KEY ("state_id")
          REFERENCES "fire_brigade_state"("id") ON DELETE SET NULL
      )
    `);

    // 4. Create EMPLOYEE table (Fire brigade employees)
    await queryRunner.query(`
      CREATE TABLE "employee" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "brigade_id" integer,
        "state_id" integer,
        "hq_id" integer,
        "status" character varying NOT NULL DEFAULT 'active',
        "position" character varying,
        "rank" character varying,
        "badge_number" character varying,
        "hire_date" date,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_employee_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_brigade" FOREIGN KEY ("brigade_id")
          REFERENCES "fire_brigade"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_employee_state" FOREIGN KEY ("state_id")
          REFERENCES "fire_brigade_state"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_employee_hq" FOREIGN KEY ("hq_id")
          REFERENCES "fire_brigade_hq"("id") ON DELETE SET NULL
      )
    `);

    // 5. Update society table to link to fire_brigade_hq (replace brigade_id meaning)
    // First check if FK exists and drop it
    await queryRunner.query(`
      ALTER TABLE "society"
      DROP CONSTRAINT IF EXISTS "FK_society_brigade"
    `);

    // Clear existing brigade_id values (they reference old schema that doesn't exist)
    // These need to be re-assigned to new fire_brigade_hq records after migration
    await queryRunner.query(`
      UPDATE "society" SET brigade_id = NULL WHERE brigade_id IS NOT NULL
    `);

    // Add proper FK to fire_brigade_hq
    await queryRunner.query(`
      ALTER TABLE "society"
      ADD CONSTRAINT "FK_society_brigade_hq"
      FOREIGN KEY ("brigade_id") REFERENCES "fire_brigade_hq"("id")
      ON DELETE SET NULL
    `);

    // 6. Create indexes for better query performance
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_hq_user_id" ON "fire_brigade_hq" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_hq_society_id" ON "fire_brigade_hq" ("society_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_hq_status" ON "fire_brigade_hq" ("status")`);

    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_state_hq_id" ON "fire_brigade_state" ("hq_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_state_status" ON "fire_brigade_state" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_state_state" ON "fire_brigade_state" ("state")`);

    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_state_id" ON "fire_brigade" ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_status" ON "fire_brigade" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_fire_brigade_location" ON "fire_brigade" ("location")`);

    await queryRunner.query(`CREATE INDEX "IDX_employee_user_id" ON "employee" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_employee_brigade_id" ON "employee" ("brigade_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_employee_state_id" ON "employee" ("state_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_employee_hq_id" ON "employee" ("hq_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_employee_status" ON "employee" ("status")`);

    // 7. Add CHECK constraints for status fields
    await queryRunner.query(`
      ALTER TABLE "fire_brigade_hq"
      ADD CONSTRAINT "CHK_fire_brigade_hq_status"
      CHECK (status IN ('active', 'inactive', 'suspended'))
    `);

    await queryRunner.query(`
      ALTER TABLE "fire_brigade_state"
      ADD CONSTRAINT "CHK_fire_brigade_state_status"
      CHECK (status IN ('active', 'inactive', 'suspended'))
    `);

    await queryRunner.query(`
      ALTER TABLE "fire_brigade"
      ADD CONSTRAINT "CHK_fire_brigade_status"
      CHECK (status IN ('active', 'inactive', 'suspended', 'on_call'))
    `);

    await queryRunner.query(`
      ALTER TABLE "employee"
      ADD CONSTRAINT "CHK_employee_status"
      CHECK (status IN ('active', 'inactive', 'on_leave', 'suspended', 'retired'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop CHECK constraints
    await queryRunner.query(`ALTER TABLE "employee" DROP CONSTRAINT IF EXISTS "CHK_employee_status"`);
    await queryRunner.query(`ALTER TABLE "fire_brigade" DROP CONSTRAINT IF EXISTS "CHK_fire_brigade_status"`);
    await queryRunner.query(`ALTER TABLE "fire_brigade_state" DROP CONSTRAINT IF EXISTS "CHK_fire_brigade_state_status"`);
    await queryRunner.query(`ALTER TABLE "fire_brigade_hq" DROP CONSTRAINT IF EXISTS "CHK_fire_brigade_hq_status"`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_hq_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_brigade_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_user_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_location"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_state_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_state_state"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_state_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_state_hq_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_hq_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_hq_society_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fire_brigade_hq_user_id"`);

    // Drop FK from society
    await queryRunner.query(`ALTER TABLE "society" DROP CONSTRAINT IF EXISTS "FK_society_brigade_hq"`);

    // Drop tables in reverse order (due to FK dependencies)
    await queryRunner.query(`DROP TABLE IF EXISTS "employee" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fire_brigade" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fire_brigade_state" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fire_brigade_hq" CASCADE`);
  }
}
