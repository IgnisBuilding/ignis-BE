import { MigrationInterface, QueryRunner } from "typeorm";

export class TablesForPgRouterTestingCreated1759512689600 implements MigrationInterface {
    name = 'TablesForPgRouterTestingCreated1759512689600'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "apartment" ("id" SERIAL NOT NULL, "unit_number" character varying NOT NULL, "occupied" boolean NOT NULL DEFAULT false, "owner_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "floor_id" integer, CONSTRAINT "PK_c3d874d9924f6f16223162b3d3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "nodes" DROP COLUMN "room_id"`);
        await queryRunner.query(`ALTER TABLE "nodes" ADD "apartment_id" integer`);
        await queryRunner.query(`ALTER TABLE "nodes" ALTER COLUMN "floor_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "hazards" ALTER COLUMN "apartment_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "exits" ALTER COLUMN "floor_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "apartment" ADD CONSTRAINT "FK_81b84604fffd7cd77950c7527ab" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "nodes" ADD CONSTRAINT "FK_42a4992a257555f6961fd117672" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "nodes" ADD CONSTRAINT "FK_ed94a5e74257d9cff09772caf48" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "hazards" ADD CONSTRAINT "FK_e8b311421d67294b08946c9034f" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exits" ADD CONSTRAINT "FK_dadf13ef3ff0d576d54d9366807" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "exits" DROP CONSTRAINT "FK_dadf13ef3ff0d576d54d9366807"`);
        await queryRunner.query(`ALTER TABLE "hazards" DROP CONSTRAINT "FK_e8b311421d67294b08946c9034f"`);
        await queryRunner.query(`ALTER TABLE "nodes" DROP CONSTRAINT "FK_ed94a5e74257d9cff09772caf48"`);
        await queryRunner.query(`ALTER TABLE "nodes" DROP CONSTRAINT "FK_42a4992a257555f6961fd117672"`);
        await queryRunner.query(`ALTER TABLE "apartment" DROP CONSTRAINT "FK_81b84604fffd7cd77950c7527ab"`);
        await queryRunner.query(`ALTER TABLE "exits" ALTER COLUMN "floor_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "hazards" ALTER COLUMN "apartment_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "nodes" ALTER COLUMN "floor_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "nodes" DROP COLUMN "apartment_id"`);
        await queryRunner.query(`ALTER TABLE "nodes" ADD "room_id" integer NOT NULL`);
        await queryRunner.query(`DROP TABLE "apartment"`);
    }

}
