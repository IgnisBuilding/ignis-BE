import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropEdgesBackupTable1800000000023 implements MigrationInterface {
  name = 'DropEdgesBackupTable1800000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the backup table as it's no longer needed
    await queryRunner.query(`DROP TABLE IF EXISTS "edges_backup_navigation"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-create the backup table structure
    await queryRunner.query(`
      CREATE TABLE "edges_backup_navigation" (
        "id" integer,
        "cost" integer,
        "geometry" geometry,
        "created_at" timestamp without time zone,
        "updated_at" timestamp without time zone,
        "source_id" integer,
        "target_id" integer,
        "edge_type" character varying,
        "is_emergency_route" boolean,
        "width_meters" double precision
      )
    `);
  }
}
