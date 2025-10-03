import { MigrationInterface, QueryRunner } from "typeorm";

export class NewLevelAttributeAddedInFloorTable1759525544201 implements MigrationInterface {
    name = 'NewLevelAttributeAddedInFloorTable1759525544201'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "floor" ADD "level" integer NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "floor" DROP COLUMN "level"`);
    }

}
