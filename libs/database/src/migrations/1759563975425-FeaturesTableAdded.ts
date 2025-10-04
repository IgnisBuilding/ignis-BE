import { MigrationInterface, QueryRunner } from "typeorm";

export class FeaturesTableAdded1759563975425 implements MigrationInterface {
    name = 'FeaturesTableAdded1759563975425'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "features" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "geometry" geometry(Polygon,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "room_id" integer, "floor_id" integer, CONSTRAINT "PK_5c1e336df2f4a7051e5bf08a941" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "floor" ADD "geometry" geometry(Polygon,3857) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "room" ADD "geometry" geometry(Polygon,3857) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "room" ADD "floor_id" integer`);
        await queryRunner.query(`ALTER TABLE "building" ADD "type" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "building" ADD "geometry" geometry(Polygon,3857) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "room" ADD CONSTRAINT "FK_ec6d3c6699ef6067c96e47d9de7" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "features" ADD CONSTRAINT "FK_657d265d642c8ec0df1222daa8b" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "features" ADD CONSTRAINT "FK_58c8ae17f246d5f0f8049e6caef" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "features" DROP CONSTRAINT "FK_58c8ae17f246d5f0f8049e6caef"`);
        await queryRunner.query(`ALTER TABLE "features" DROP CONSTRAINT "FK_657d265d642c8ec0df1222daa8b"`);
        await queryRunner.query(`ALTER TABLE "room" DROP CONSTRAINT "FK_ec6d3c6699ef6067c96e47d9de7"`);
        await queryRunner.query(`ALTER TABLE "building" DROP COLUMN "geometry"`);
        await queryRunner.query(`ALTER TABLE "building" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "room" DROP COLUMN "floor_id"`);
        await queryRunner.query(`ALTER TABLE "room" DROP COLUMN "geometry"`);
        await queryRunner.query(`ALTER TABLE "floor" DROP COLUMN "geometry"`);
        await queryRunner.query(`DROP TABLE "features"`);
    }

}
