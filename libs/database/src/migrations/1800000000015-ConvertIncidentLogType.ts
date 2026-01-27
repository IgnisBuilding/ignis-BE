import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertIncidentLogType1800000000015 implements MigrationInterface {
  name = 'ConvertIncidentLogType1800000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, add a new varchar column
    await queryRunner.query(`
      ALTER TABLE "incident_log" ADD COLUMN "type_new" character varying
    `);

    // Map existing integer values to string types
    await queryRunner.query(`
      UPDATE "incident_log"
      SET type_new = CASE type
        WHEN 1 THEN 'fire'
        WHEN 2 THEN 'smoke'
        WHEN 3 THEN 'gas_leak'
        WHEN 4 THEN 'structural'
        WHEN 5 THEN 'medical'
        WHEN 6 THEN 'evacuation'
        WHEN 7 THEN 'false_alarm'
        ELSE 'other'
      END
    `);

    // Drop the old column
    await queryRunner.query(`ALTER TABLE "incident_log" DROP COLUMN "type"`);

    // Rename the new column
    await queryRunner.query(`ALTER TABLE "incident_log" RENAME COLUMN "type_new" TO "type"`);

    // Make it NOT NULL
    await queryRunner.query(`ALTER TABLE "incident_log" ALTER COLUMN "type" SET NOT NULL`);

    // Add CHECK constraint
    await queryRunner.query(`
      ALTER TABLE "incident_log"
      ADD CONSTRAINT "CHK_incident_log_type"
      CHECK (type IN ('fire', 'smoke', 'gas_leak', 'structural', 'medical', 'evacuation', 'false_alarm', 'other'))
    `);

    // Add index for type
    await queryRunner.query(`CREATE INDEX "IDX_incident_log_type" ON "incident_log" ("type")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_incident_log_type"`);

    // Drop CHECK constraint
    await queryRunner.query(`ALTER TABLE "incident_log" DROP CONSTRAINT IF EXISTS "CHK_incident_log_type"`);

    // Add integer column back
    await queryRunner.query(`ALTER TABLE "incident_log" ADD COLUMN "type_old" integer`);

    // Map string values back to integers
    await queryRunner.query(`
      UPDATE "incident_log"
      SET type_old = CASE type
        WHEN 'fire' THEN 1
        WHEN 'smoke' THEN 2
        WHEN 'gas_leak' THEN 3
        WHEN 'structural' THEN 4
        WHEN 'medical' THEN 5
        WHEN 'evacuation' THEN 6
        WHEN 'false_alarm' THEN 7
        ELSE 0
      END
    `);

    // Drop varchar column
    await queryRunner.query(`ALTER TABLE "incident_log" DROP COLUMN "type"`);

    // Rename old column
    await queryRunner.query(`ALTER TABLE "incident_log" RENAME COLUMN "type_old" TO "type"`);

    // Make NOT NULL
    await queryRunner.query(`ALTER TABLE "incident_log" ALTER COLUMN "type" SET NOT NULL`);
  }
}
