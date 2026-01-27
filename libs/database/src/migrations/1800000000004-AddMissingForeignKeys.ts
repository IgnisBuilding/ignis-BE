import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingForeignKeys1800000000004 implements MigrationInterface {
  name = 'AddMissingForeignKeys1800000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add FK: building.society_id -> society.id
    await queryRunner.query(`
      ALTER TABLE "building"
      ADD CONSTRAINT "FK_building_society"
      FOREIGN KEY ("society_id") REFERENCES "society"("id")
      ON DELETE SET NULL
    `);

    // 2. Add FK: floor.building_id -> building.id (if not exists)
    const floorFkExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'FK_floor_building'
      AND table_name = 'floor'
    `);

    if (floorFkExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "floor"
        ADD CONSTRAINT "FK_floor_building"
        FOREIGN KEY ("building_id") REFERENCES "building"("id")
        ON DELETE CASCADE
      `);
    }

    // 3. Add FK: sensor_log.sensor_id -> sensors.id
    await queryRunner.query(`
      ALTER TABLE "sensor_log"
      ADD CONSTRAINT "FK_sensor_log_sensor"
      FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id")
      ON DELETE CASCADE
    `);

    // 4. Add FK: society.owner_id -> users.id
    await queryRunner.query(`
      ALTER TABLE "society"
      ADD CONSTRAINT "FK_society_owner"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

    // 5. Add FK: evacuation_route.assigned_to -> users.id
    await queryRunner.query(`
      ALTER TABLE "evacuation_route"
      ADD CONSTRAINT "FK_evacuation_route_assigned_user"
      FOREIGN KEY ("assigned_to") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

    // 6. Make society.owner_id nullable (it references users, should allow null)
    await queryRunner.query(`
      ALTER TABLE "society"
      ALTER COLUMN "owner_id" DROP NOT NULL
    `);

    // 7. Make society.brigade_id nullable (unclear target, keep as optional)
    await queryRunner.query(`
      ALTER TABLE "society"
      ALTER COLUMN "brigade_id" DROP NOT NULL
    `);

    // Create indexes for foreign key columns
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_building_society_id" ON "building" ("society_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sensor_log_sensor_id" ON "sensor_log" ("sensor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_society_owner_id" ON "society" ("owner_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_evacuation_route_assigned_to" ON "evacuation_route" ("assigned_to")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_evacuation_route_assigned_to"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_society_owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensor_log_sensor_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_building_society_id"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "evacuation_route" DROP CONSTRAINT IF EXISTS "FK_evacuation_route_assigned_user"`);
    await queryRunner.query(`ALTER TABLE "society" DROP CONSTRAINT IF EXISTS "FK_society_owner"`);
    await queryRunner.query(`ALTER TABLE "sensor_log" DROP CONSTRAINT IF EXISTS "FK_sensor_log_sensor"`);
    await queryRunner.query(`ALTER TABLE "floor" DROP CONSTRAINT IF EXISTS "FK_floor_building"`);
    await queryRunner.query(`ALTER TABLE "building" DROP CONSTRAINT IF EXISTS "FK_building_society"`);

    // Restore NOT NULL constraints
    await queryRunner.query(`ALTER TABLE "society" ALTER COLUMN "owner_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "society" ALTER COLUMN "brigade_id" SET NOT NULL`);
  }
}
