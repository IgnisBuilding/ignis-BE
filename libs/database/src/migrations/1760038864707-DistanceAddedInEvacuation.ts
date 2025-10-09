import { MigrationInterface, QueryRunner } from "typeorm";

export class DistanceAddedInEvacuation1760038864707 implements MigrationInterface {
    name = 'DistanceAddedInEvacuation1760038864707'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD "distance" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ALTER COLUMN "assigned_to" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evacuation_route" ALTER COLUMN "assigned_to" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP COLUMN "distance"`);
    }

}
