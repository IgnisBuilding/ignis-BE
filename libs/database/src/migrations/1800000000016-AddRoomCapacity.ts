import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoomCapacity1800000000016 implements MigrationInterface {
  name = 'AddRoomCapacity1800000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add capacity column to room
    await queryRunner.query(`
      ALTER TABLE "room" ADD COLUMN "capacity" integer
    `);

    // Add CHECK constraint for positive capacity
    await queryRunner.query(`
      ALTER TABLE "room"
      ADD CONSTRAINT "CHK_room_capacity"
      CHECK (capacity IS NULL OR capacity > 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop CHECK constraint
    await queryRunner.query(`ALTER TABLE "room" DROP CONSTRAINT IF EXISTS "CHK_room_capacity"`);

    // Drop column
    await queryRunner.query(`ALTER TABLE "room" DROP COLUMN IF EXISTS "capacity"`);
  }
}
