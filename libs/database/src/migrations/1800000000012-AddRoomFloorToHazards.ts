import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoomFloorToHazards1800000000012 implements MigrationInterface {
  name = 'AddRoomFloorToHazards1800000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add room_id column to hazards
    await queryRunner.query(`
      ALTER TABLE "hazards" ADD COLUMN "room_id" integer
    `);

    // Add floor_id column to hazards
    await queryRunner.query(`
      ALTER TABLE "hazards" ADD COLUMN "floor_id" integer
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "hazards"
      ADD CONSTRAINT "FK_hazards_room"
      FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "hazards"
      ADD CONSTRAINT "FK_hazards_floor"
      FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE SET NULL
    `);

    // Add indexes for better query performance
    await queryRunner.query(`CREATE INDEX "IDX_hazards_room_id" ON "hazards" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_hazards_floor_id" ON "hazards" ("floor_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hazards_floor_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hazards_room_id"`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "FK_hazards_floor"`);
    await queryRunner.query(`ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "FK_hazards_room"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "hazards" DROP COLUMN IF EXISTS "floor_id"`);
    await queryRunner.query(`ALTER TABLE "hazards" DROP COLUMN IF EXISTS "room_id"`);
  }
}
