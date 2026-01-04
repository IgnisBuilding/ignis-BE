import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeometryToApartment1765357467431 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add geometry column to apartment table
    await queryRunner.query(`
      ALTER TABLE apartment 
      ADD COLUMN geometry geometry(Polygon, 3857)
    `);

    console.log('Added geometry column to apartment table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove geometry column from apartment table
    await queryRunner.query(`
      ALTER TABLE apartment 
      DROP COLUMN IF EXISTS geometry
    `);

    console.log('Removed geometry column from apartment table');
  }
}
