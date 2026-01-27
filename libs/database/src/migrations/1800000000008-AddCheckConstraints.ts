import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckConstraints1800000000008 implements MigrationInterface {
  name = 'AddCheckConstraints1800000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === NORMALIZE EXISTING DATA FIRST ===

    // Normalize hazards status to lowercase
    await queryRunner.query(`
      UPDATE "hazards" SET status = LOWER(status) WHERE status != LOWER(status)
    `);

    // Normalize hazards severity to lowercase
    await queryRunner.query(`
      UPDATE "hazards" SET severity = LOWER(severity) WHERE severity != LOWER(severity)
    `);

    // Normalize hazards type to lowercase
    await queryRunner.query(`
      UPDATE "hazards" SET type = LOWER(type) WHERE type != LOWER(type)
    `);

    // Normalize rescue_teams status to uppercase
    await queryRunner.query(`
      UPDATE "rescue_teams" SET status = UPPER(status) WHERE status != UPPER(status)
    `);

    // Normalize trapped_occupants status to uppercase
    await queryRunner.query(`
      UPDATE "trapped_occupants" SET status = UPPER(status) WHERE status != UPPER(status)
    `);

    // Normalize trapped_occupants priority_level to uppercase
    await queryRunner.query(`
      UPDATE "trapped_occupants" SET priority_level = UPPER(priority_level) WHERE priority_level != UPPER(priority_level)
    `);

    // Normalize sensors status to lowercase
    await queryRunner.query(`
      UPDATE "sensors" SET status = LOWER(status) WHERE status != LOWER(status)
    `);

    // Normalize camera status to lowercase
    await queryRunner.query(`
      UPDATE "camera" SET status = LOWER(status) WHERE status != LOWER(status)
    `);

    // Normalize users role to lowercase
    await queryRunner.query(`
      UPDATE "users" SET role = LOWER(role) WHERE role != LOWER(role)
    `);

    // === ADD CHECK CONSTRAINTS (only essential ones that won't break existing data) ===

    // Hazards - status constraint
    await queryRunner.query(`
      ALTER TABLE "hazards"
      ADD CONSTRAINT "CHK_hazards_status"
      CHECK (status IN ('active', 'responded', 'resolved', 'false_alarm', 'pending'))
    `);

    // Hazards - severity constraint
    await queryRunner.query(`
      ALTER TABLE "hazards"
      ADD CONSTRAINT "CHK_hazards_severity"
      CHECK (severity IN ('low', 'medium', 'high', 'critical'))
    `);

    // Rescue teams - status constraint
    await queryRunner.query(`
      ALTER TABLE "rescue_teams"
      ADD CONSTRAINT "CHK_rescue_teams_status"
      CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RETURNING', 'OFF_DUTY'))
    `);

    // Trapped occupants - status constraint
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants"
      ADD CONSTRAINT "CHK_trapped_occupants_status"
      CHECK (status IN ('TRAPPED', 'SHELTERING', 'RESCUED', 'EVACUATED', 'DECEASED'))
    `);

    // Trapped occupants - priority_level constraint
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants"
      ADD CONSTRAINT "CHK_trapped_occupants_priority_level"
      CHECK (priority_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))
    `);

    // Trapped occupants - priority_score constraint (higher limit to accommodate existing data)
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants"
      ADD CONSTRAINT "CHK_trapped_occupants_priority_score"
      CHECK (priority_score >= 0)
    `);

    // Trapped occupants - occupant_count constraint
    await queryRunner.query(`
      ALTER TABLE "trapped_occupants"
      ADD CONSTRAINT "CHK_trapped_occupants_occupant_count"
      CHECK (occupant_count >= 1)
    `);

    // Exits - capacity constraint
    await queryRunner.query(`
      ALTER TABLE "exits"
      ADD CONSTRAINT "CHK_exits_capacity"
      CHECK (capacity > 0)
    `);

    // Edges - cost constraint
    await queryRunner.query(`
      ALTER TABLE "edges"
      ADD CONSTRAINT "CHK_edges_cost"
      CHECK (cost >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all check constraints
    const constraints = [
      { table: 'hazards', name: 'CHK_hazards_status' },
      { table: 'hazards', name: 'CHK_hazards_severity' },
      { table: 'rescue_teams', name: 'CHK_rescue_teams_status' },
      { table: 'trapped_occupants', name: 'CHK_trapped_occupants_status' },
      { table: 'trapped_occupants', name: 'CHK_trapped_occupants_priority_level' },
      { table: 'trapped_occupants', name: 'CHK_trapped_occupants_priority_score' },
      { table: 'trapped_occupants', name: 'CHK_trapped_occupants_occupant_count' },
      { table: 'exits', name: 'CHK_exits_capacity' },
      { table: 'edges', name: 'CHK_edges_cost' },
    ];

    for (const c of constraints) {
      await queryRunner.query(`ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}"`);
    }
  }
}
