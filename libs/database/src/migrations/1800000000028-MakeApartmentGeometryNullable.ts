import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeApartmentGeometryNullable1800000000028 implements MigrationInterface {
  name = 'MakeApartmentGeometryNullable1800000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "apartment" ALTER COLUMN "geometry" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot easily revert this without data loss
  }
}
