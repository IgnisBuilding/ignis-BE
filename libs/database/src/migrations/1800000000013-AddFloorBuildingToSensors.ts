import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFloorBuildingToSensors1800000000013 implements MigrationInterface {
  name = 'AddFloorBuildingToSensors1800000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add floor_id column to sensors (optional - for hallway sensors)
    await queryRunner.query(`
      ALTER TABLE "sensors" ADD COLUMN "floor_id" integer
    `);

    // Add building_id column to sensors
    // First add as nullable, then populate, then make NOT NULL
    await queryRunner.query(`
      ALTER TABLE "sensors" ADD COLUMN "building_id" integer
    `);

    // Populate building_id from room -> floor -> building relationship
    await queryRunner.query(`
      UPDATE "sensors" s
      SET building_id = f.building_id
      FROM "room" r
      JOIN "floor" f ON r.floor_id = f.id
      WHERE s.room_id = r.id AND s.building_id IS NULL
    `);

    // For sensors without room_id, we leave building_id as NULL
    // We won't make it NOT NULL since some sensors might not have room_id yet

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "FK_sensors_floor"
      FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "FK_sensors_building"
      FOREIGN KEY ("building_id") REFERENCES "building"("id") ON DELETE SET NULL
    `);

    // Add indexes
    await queryRunner.query(`CREATE INDEX "IDX_sensors_floor_id" ON "sensors" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sensors_building_id" ON "sensors" ("building_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensors_building_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensors_floor_id"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT IF EXISTS "FK_sensors_building"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT IF EXISTS "FK_sensors_floor"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "building_id"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "floor_id"`);
  }
}
