import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixIncidentLogDataTypes1800000000002 implements MigrationInterface {
  name = 'FixIncidentLogDataTypes1800000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix 'reason' column: date -> text
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "reason" TYPE text USING reason::text
    `);

    // Fix 'severity' column: date -> varchar
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "severity" TYPE character varying USING severity::character varying
    `);

    // Fix 'apartment_id' column: date -> integer
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "apartment_id" TYPE integer USING NULL
    `);

    // Fix 'floor_id' column: date -> integer
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "floor_id" TYPE integer USING NULL
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ADD CONSTRAINT "FK_incident_log_apartment"
      FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ADD CONSTRAINT "FK_incident_log_floor"
      FOREIGN KEY ("floor_id") REFERENCES "floor"("id")
      ON DELETE SET NULL
    `);

    // Make apartment_id and floor_id nullable (they were NOT NULL with date type)
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "apartment_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "floor_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "reason" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign keys
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      DROP CONSTRAINT IF EXISTS "FK_incident_log_apartment"
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      DROP CONSTRAINT IF EXISTS "FK_incident_log_floor"
    `);

    // Revert column types (this will lose data)
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "reason" TYPE date USING NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "severity" TYPE date USING NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "apartment_id" TYPE date USING NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ALTER COLUMN "floor_id" TYPE date USING NULL
    `);
  }
}
