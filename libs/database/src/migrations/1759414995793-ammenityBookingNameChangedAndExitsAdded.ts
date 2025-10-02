import { MigrationInterface, QueryRunner } from "typeorm";

export class AmmenityBookingNameChangedAndExitsAdded1759414995793 implements MigrationInterface {
    name = 'AmmenityBookingNameChangedAndExitsAdded1759414995793'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "exits" ("id" SERIAL NOT NULL, "node_id" character varying NOT NULL, "floor_id" integer NOT NULL, "type" boolean NOT NULL DEFAULT false, "capacity" integer NOT NULL, "geometry" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bc10e84eb866599a06689b2c4e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ammenity_booking" ("id" SERIAL NOT NULL, "ammenity_id" integer NOT NULL, "user_id" integer NOT NULL, "start_time" date NOT NULL, "end_time" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_05d89d166be0f4892b0328fd5fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "ammenity_id"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "start_time"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "end_time"`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "building_id" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "name" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "description" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "available" date NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "available"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "ammenity" DROP COLUMN "building_id"`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "end_time" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "start_time" date NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "user_id" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ammenity" ADD "ammenity_id" integer NOT NULL`);
        await queryRunner.query(`DROP TABLE "ammenity_booking"`);
        await queryRunner.query(`DROP TABLE "exits"`);
    }

}
