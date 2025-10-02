import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1759401474765 implements MigrationInterface {
    name = 'InitialMigration1759401474765'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "society" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "location" character varying NOT NULL, "owner_id" integer NOT NULL, "brigade_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a4a918e64ee377253ae46642021" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "sensor_log" ("id" SERIAL NOT NULL, "sensor_id" integer NOT NULL, "sensor_detection" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3fe34c68f2572c3418efe405d95" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "sensor" ("id" SERIAL NOT NULL, "type" integer NOT NULL, "building_id" integer NOT NULL, "floor_id" date NOT NULL, "appartment_id" date NOT NULL, "location_description" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ccc38b9aa8b3e198b6503d5eee9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "payment" ("id" SERIAL NOT NULL, "bill_id" integer NOT NULL, "type" character varying NOT NULL, "date" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "notification" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "type" character varying NOT NULL, "message" date NOT NULL, "status" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "meter" ("id" SERIAL NOT NULL, "appartment_id" integer NOT NULL, "type" character varying NOT NULL, "installed_at" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a2a722edc5f966fa3562638f91" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "meter_reading" ("id" SERIAL NOT NULL, "meter_id" integer NOT NULL, "value" double precision NOT NULL, "time" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_933383ce48c42f14109fdaed881" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "incident_log" ("id" SERIAL NOT NULL, "type" integer NOT NULL, "description" character varying NOT NULL, "reason" date NOT NULL, "severity" date NOT NULL, "appartment_id" date NOT NULL, "floor_id" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_88374be0294237ceafc01c4535b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "floor" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "building_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_16a0823530c5b0dd226b8a96ee1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "building" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "address" character varying NOT NULL, "society_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bbfaf6c11f141a22d2ab105ee5f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bill_split" ("id" SERIAL NOT NULL, "bill_id" integer NOT NULL, "user_id" integer NOT NULL, "split_amount" date NOT NULL, "paid" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cc3735c5d534325947445656127" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bill" ("id" SERIAL NOT NULL, "owner_id" integer NOT NULL, "type" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "usage" numeric(12,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_683b47912b8b30fe71d1fa22199" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "appartment" ("id" SERIAL NOT NULL, "unit_number" character varying NOT NULL, "floor_id" integer NOT NULL, "occupied" boolean NOT NULL DEFAULT false, "owner_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4ba66ffcde56347caf7b1413426" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ammenity" ("id" SERIAL NOT NULL, "ammenity_id" integer NOT NULL, "user_id" integer NOT NULL, "start_time" date NOT NULL, "end_time" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_abf1893a2788af03ba789c2fd7f" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "ammenity"`);
        await queryRunner.query(`DROP TABLE "appartment"`);
        await queryRunner.query(`DROP TABLE "bill"`);
        await queryRunner.query(`DROP TABLE "bill_split"`);
        await queryRunner.query(`DROP TABLE "building"`);
        await queryRunner.query(`DROP TABLE "floor"`);
        await queryRunner.query(`DROP TABLE "incident_log"`);
        await queryRunner.query(`DROP TABLE "meter_reading"`);
        await queryRunner.query(`DROP TABLE "meter"`);
        await queryRunner.query(`DROP TABLE "notification"`);
        await queryRunner.query(`DROP TABLE "payment"`);
        await queryRunner.query(`DROP TABLE "sensor"`);
        await queryRunner.query(`DROP TABLE "sensor_log"`);
        await queryRunner.query(`DROP TABLE "society"`);
    }

}
