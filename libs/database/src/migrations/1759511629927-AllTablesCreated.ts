import { MigrationInterface, QueryRunner } from "typeorm";

export class AllTablesCreated1759511629927 implements MigrationInterface {
    name = 'AllTablesCreated1759511629927'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "incident_log" RENAME COLUMN "appartment_id" TO "apartment_id"`);
        await queryRunner.query(`CREATE TABLE "nodes" ("id" SERIAL NOT NULL, "floor_id" integer NOT NULL, "room_id" integer NOT NULL, "type" character varying NOT NULL, "geometry" geometry(Point,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_682d6427523a0fa43d062ea03ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "hazards" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "apartment_id" integer NOT NULL, "severity" character varying NOT NULL, "status" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "node_id" integer, CONSTRAINT "PK_237b20b02a3823b79d5a0144c7c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "evacuation_route" ("id" SERIAL NOT NULL, "path" geometry(LineString,3857) NOT NULL, "assigned_to" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "start_node" integer, CONSTRAINT "PK_952f0e876959bb0df04e503f48c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "edges" ("id" SERIAL NOT NULL, "cost" integer NOT NULL, "geometry" geometry(LineString,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "source" integer, CONSTRAINT "PK_46bb3dd9779f5e6d0d2200cc1b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "type" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "geometry"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "geometry" geometry(LineString,3857) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "node_id"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "node_id" integer`);
        await queryRunner.query(`ALTER TABLE "hazards" ADD CONSTRAINT "FK_f627608aac8a9b7904f8888648e" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exits" ADD CONSTRAINT "FK_155d054626aae9e009100727d8f" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_db8bf52b9900c5a1fb4c5796375" FOREIGN KEY ("start_node") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "edges" ADD CONSTRAINT "FK_14f679a0c2578dad14fdf2913ec" FOREIGN KEY ("source") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "edges" DROP CONSTRAINT "FK_14f679a0c2578dad14fdf2913ec"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_db8bf52b9900c5a1fb4c5796375"`);
        await queryRunner.query(`ALTER TABLE "exits" DROP CONSTRAINT "FK_155d054626aae9e009100727d8f"`);
        await queryRunner.query(`ALTER TABLE "hazards" DROP CONSTRAINT "FK_f627608aac8a9b7904f8888648e"`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "node_id"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "node_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "geometry"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "geometry" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "exits" DROP COLUMN "type"`);
        await queryRunner.query(`ALTER TABLE "exits" ADD "type" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`DROP TABLE "edges"`);
        await queryRunner.query(`DROP TABLE "evacuation_route"`);
        await queryRunner.query(`DROP TABLE "hazards"`);
        await queryRunner.query(`DROP TABLE "nodes"`);
        await queryRunner.query(`ALTER TABLE "incident_log" RENAME COLUMN "apartment_id" TO "appartment_id"`);
    }

}
