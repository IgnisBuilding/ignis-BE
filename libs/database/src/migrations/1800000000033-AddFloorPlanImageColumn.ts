import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFloorPlanImageColumn1800000000033 implements MigrationInterface {
  name = 'AddFloorPlanImageColumn1800000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add floor_plan_image column to building table
    // Using TEXT type to store Base64 encoded image data
    // This stores the main floor plan blueprint image for the building
    await queryRunner.query(`
      ALTER TABLE "building"
      ADD COLUMN IF NOT EXISTS "floor_plan_image" TEXT
    `);

    // Add floor_plan_image column to floor table for per-floor images
    // Useful when different floors have different layouts
    await queryRunner.query(`
      ALTER TABLE "floor"
      ADD COLUMN IF NOT EXISTS "floor_plan_image" TEXT
    `);

    // Add editor_state column to building table
    // Stores the complete editor state as JSON (rooms, openings, cameras, etc.)
    // This allows restoring the exact editor state without reconstruction
    await queryRunner.query(`
      ALTER TABLE "building"
      ADD COLUMN IF NOT EXISTS "editor_state" JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "editor_state"`);
    await queryRunner.query(`ALTER TABLE "floor" DROP COLUMN IF EXISTS "floor_plan_image"`);
    await queryRunner.query(`ALTER TABLE "building" DROP COLUMN IF EXISTS "floor_plan_image"`);
  }
}
