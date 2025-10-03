import { MigrationInterface, QueryRunner } from "typeorm";

export class Undefined1759524511027 implements MigrationInterface {
    name = 'Undefined1759524511027'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "room" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "type" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "apartment_id" integer, CONSTRAINT "PK_c6d46db005d623e691b2fbcba23" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "room" ADD CONSTRAINT "FK_2c812c09b31f5b684d35b952a06" FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "room" DROP CONSTRAINT "FK_2c812c09b31f5b684d35b952a06"`);
        await queryRunner.query(`DROP TABLE "room"`);
    }

}
