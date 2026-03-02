import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSensorColumnTypes1765384094448 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing columns with wrong data type
    await queryRunner.query(`
      ALTER TABLE sensor 
      DROP COLUMN IF EXISTS floor_id,
      DROP COLUMN IF EXISTS appartment_id,
      DROP COLUMN IF EXISTS location_description
    `);

    // Add them back with correct data types
    await queryRunner.query(`
      ALTER TABLE sensor 
      ADD COLUMN floor_id INTEGER,
      ADD COLUMN appartment_id INTEGER,
      ADD COLUMN location_description VARCHAR(255)
    `);

    console.log('Fixed sensor table column types: floor_id, appartment_id (now INTEGER), location_description (now VARCHAR)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to date types (not recommended, but for rollback completeness)
    await queryRunner.query(`
      ALTER TABLE sensor 
      DROP COLUMN IF EXISTS floor_id,
      DROP COLUMN IF EXISTS appartment_id,
      DROP COLUMN IF EXISTS location_description
    `);

    await queryRunner.query(`
      ALTER TABLE sensor 
      ADD COLUMN floor_id DATE,
      ADD COLUMN appartment_id DATE,
      ADD COLUMN location_description DATE
    `);

    console.log('Reverted sensor table column types back to DATE');
  }
}
