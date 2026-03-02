import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "society" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "location" character varying NOT NULL, "owner_id" integer NOT NULL, "brigade_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a4a918e64ee377253ae46642021" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "sensor_log" ("id" SERIAL NOT NULL, "sensor_id" integer NOT NULL, "sensor_detection" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3fe34c68f2572c3418efe405d95" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "notification" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "type" character varying NOT NULL, "message" date NOT NULL, "status" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "sensor" ("id" SERIAL NOT NULL, "type" integer NOT NULL, "building_id" integer NOT NULL, "floor_id" date NOT NULL, "appartment_id" date NOT NULL, "location_description" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ccc38b9aa8b3e198b6503d5eee9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "floor" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "level" integer NOT NULL, "building_id" integer NOT NULL, "geometry" geometry(Polygon,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_16a0823530c5b0dd226b8a96ee1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "apartment" ("id" SERIAL NOT NULL, "unit_number" character varying NOT NULL, "occupied" boolean NOT NULL DEFAULT false, "owner_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "floor_id" integer, CONSTRAINT "PK_c3d874d9924f6f16223162b3d3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "nodes" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "geometry" geometry(Point,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "floor_id" integer, "apartment_id" integer, CONSTRAINT "PK_682d6427523a0fa43d062ea03ee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "meter_reading" ("id" SERIAL NOT NULL, "meter_id" integer NOT NULL, "value" double precision NOT NULL, "time" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_933383ce48c42f14109fdaed881" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "room" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "geometry" geometry(Polygon,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "apartment_id" integer, "floor_id" integer, CONSTRAINT "PK_c6d46db005d623e691b2fbcba23" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "meter" ("id" SERIAL NOT NULL, "appartment_id" integer NOT NULL, "type" character varying NOT NULL, "installed_at" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a2a722edc5f966fa3562638f91" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "evacuation_route" ("id" SERIAL NOT NULL, "path" geometry(LineString,3857) NOT NULL, "assigned_to" integer, "distance" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "start_node_id" integer, "end_node_id" integer, CONSTRAINT "PK_952f0e876959bb0df04e503f48c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "exits" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "capacity" integer NOT NULL, "geometry" geometry(LineString,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "node_id" integer, "floor_id" integer, CONSTRAINT "PK_bc10e84eb866599a06689b2c4e5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "building" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "address" character varying NOT NULL, "geometry" geometry(Polygon,3857) NOT NULL, "society_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bbfaf6c11f141a22d2ab105ee5f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payment" ("id" SERIAL NOT NULL, "bill_id" integer NOT NULL, "type" character varying NOT NULL, "date" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "edges" ("id" SERIAL NOT NULL, "cost" integer NOT NULL, "geometry" geometry(LineString,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "source_id" integer, "target_id" integer, CONSTRAINT "PK_46bb3dd9779f5e6d0d2200cc1b0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "incident_log" ("id" SERIAL NOT NULL, "type" integer NOT NULL, "description" character varying NOT NULL, "reason" date NOT NULL, "severity" date NOT NULL, "apartment_id" date NOT NULL, "floor_id" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_88374be0294237ceafc01c4535b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "hazards" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "severity" character varying NOT NULL, "status" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "apartment_id" integer, "node_id" integer, CONSTRAINT "PK_237b20b02a3823b79d5a0144c7c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ammenity" ("id" SERIAL NOT NULL, "building_id" integer NOT NULL, "name" integer NOT NULL, "description" date NOT NULL, "available" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_abf1893a2788af03ba789c2fd7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ammenity_booking" ("id" SERIAL NOT NULL, "ammenity_id" integer NOT NULL, "user_id" integer NOT NULL, "start_time" date NOT NULL, "end_time" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_05d89d166be0f4892b0328fd5fe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "bill" ("id" SERIAL NOT NULL, "owner_id" integer NOT NULL, "type" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "usage" numeric(12,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_683b47912b8b30fe71d1fa22199" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "bill_split" ("id" SERIAL NOT NULL, "bill_id" integer NOT NULL, "user_id" integer NOT NULL, "split_amount" date NOT NULL, "paid" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cc3735c5d534325947445656127" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "features" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "geometry" geometry(Polygon,3857) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "room_id" integer, "floor_id" integer, CONSTRAINT "PK_5c1e336df2f4a7051e5bf08a941" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "apartment" ADD CONSTRAINT "FK_81b84604fffd7cd77950c7527ab" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "nodes" ADD CONSTRAINT "FK_42a4992a257555f6961fd117672" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "nodes" ADD CONSTRAINT "FK_ed94a5e74257d9cff09772caf48" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" ADD CONSTRAINT "FK_2c812c09b31f5b684d35b952a06" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" ADD CONSTRAINT "FK_ec6d3c6699ef6067c96e47d9de7" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_08210dda6353b3bc2579acf9cff" FOREIGN KEY ("start_node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_e3ac1f3f68a3129031631b88745" FOREIGN KEY ("end_node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "exits" ADD CONSTRAINT "FK_155d054626aae9e009100727d8f" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "exits" ADD CONSTRAINT "FK_dadf13ef3ff0d576d54d9366807" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "edges" ADD CONSTRAINT "FK_cf6a8dd0c8ddb23564d38909bec" FOREIGN KEY ("source_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "edges" ADD CONSTRAINT "FK_f69f63f2300a02b50a19a6eee68" FOREIGN KEY ("target_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "hazards" ADD CONSTRAINT "FK_e8b311421d67294b08946c9034f" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "hazards" ADD CONSTRAINT "FK_f627608aac8a9b7904f8888648e" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "features" ADD CONSTRAINT "FK_657d265d642c8ec0df1222daa8b" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "features" ADD CONSTRAINT "FK_58c8ae17f246d5f0f8049e6caef" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "features" DROP CONSTRAINT "FK_58c8ae17f246d5f0f8049e6caef"`,
    );
    await queryRunner.query(
      `ALTER TABLE "features" DROP CONSTRAINT "FK_657d265d642c8ec0df1222daa8b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hazards" DROP CONSTRAINT "FK_f627608aac8a9b7904f8888648e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hazards" DROP CONSTRAINT "FK_e8b311421d67294b08946c9034f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "edges" DROP CONSTRAINT "FK_f69f63f2300a02b50a19a6eee68"`,
    );
    await queryRunner.query(
      `ALTER TABLE "edges" DROP CONSTRAINT "FK_cf6a8dd0c8ddb23564d38909bec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exits" DROP CONSTRAINT "FK_dadf13ef3ff0d576d54d9366807"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exits" DROP CONSTRAINT "FK_155d054626aae9e009100727d8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_e3ac1f3f68a3129031631b88745"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_08210dda6353b3bc2579acf9cff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" DROP CONSTRAINT "FK_ec6d3c6699ef6067c96e47d9de7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room" DROP CONSTRAINT "FK_2c812c09b31f5b684d35b952a06"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nodes" DROP CONSTRAINT "FK_ed94a5e74257d9cff09772caf48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nodes" DROP CONSTRAINT "FK_42a4992a257555f6961fd117672"`,
    );
    await queryRunner.query(
      `ALTER TABLE "apartment" DROP CONSTRAINT "FK_81b84604fffd7cd77950c7527ab"`,
    );
    await queryRunner.query(`DROP TABLE "features"`);
    await queryRunner.query(`DROP TABLE "bill_split"`);
    await queryRunner.query(`DROP TABLE "bill"`);
    await queryRunner.query(`DROP TABLE "ammenity_booking"`);
    await queryRunner.query(`DROP TABLE "ammenity"`);
    await queryRunner.query(`DROP TABLE "hazards"`);
    await queryRunner.query(`DROP TABLE "incident_log"`);
    await queryRunner.query(`DROP TABLE "edges"`);
    await queryRunner.query(`DROP TABLE "payment"`);
    await queryRunner.query(`DROP TABLE "building"`);
    await queryRunner.query(`DROP TABLE "exits"`);
    await queryRunner.query(`DROP TABLE "evacuation_route"`);
    await queryRunner.query(`DROP TABLE "meter"`);
    await queryRunner.query(`DROP TABLE "room"`);
    await queryRunner.query(`DROP TABLE "meter_reading"`);
    await queryRunner.query(`DROP TABLE "nodes"`);
    await queryRunner.query(`DROP TABLE "apartment"`);
    await queryRunner.query(`DROP TABLE "floor"`);
    await queryRunner.query(`DROP TABLE "sensor"`);
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TABLE "sensor_log"`);
    await queryRunner.query(`DROP TABLE "society"`);
  }
}
