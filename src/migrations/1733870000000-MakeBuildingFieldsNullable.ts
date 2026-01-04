import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeBuildingFieldsNullable1733870000000 implements MigrationInterface {
    name = 'MakeBuildingFieldsNullable1733870000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Make society_id nullable
        await queryRunner.query(`ALTER TABLE "building" ALTER COLUMN "society_id" DROP NOT NULL`);
        
        // Make geometry nullable
        await queryRunner.query(`ALTER TABLE "building" ALTER COLUMN "geometry" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert: make fields NOT NULL again
        await queryRunner.query(`ALTER TABLE "building" ALTER COLUMN "geometry" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "building" ALTER COLUMN "society_id" SET NOT NULL`);
    }
}
