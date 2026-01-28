import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateOpeningTypeConstraint1800000000032 implements MigrationInterface {
  name = 'UpdateOpeningTypeConstraint1800000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing opening_type constraint
    await queryRunner.query(`
      ALTER TABLE "opening" DROP CONSTRAINT IF EXISTS "CHK_opening_type"
    `);

    // Add updated constraint with new opening types (main_entrance, arch)
    await queryRunner.query(`
      ALTER TABLE "opening"
      ADD CONSTRAINT "CHK_opening_type"
      CHECK (opening_type IN ('door', 'emergency_exit', 'window', 'gate', 'main_entrance', 'arch', 'other'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the updated constraint
    await queryRunner.query(`
      ALTER TABLE "opening" DROP CONSTRAINT IF EXISTS "CHK_opening_type"
    `);

    // Restore original constraint
    await queryRunner.query(`
      ALTER TABLE "opening"
      ADD CONSTRAINT "CHK_opening_type"
      CHECK (opening_type IN ('door', 'emergency_exit', 'window', 'gate', 'other'))
    `);
  }
}
