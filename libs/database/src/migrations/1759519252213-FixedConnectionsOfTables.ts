import { MigrationInterface, QueryRunner } from "typeorm";

export class FixedConnectionsOfTables1759519252213 implements MigrationInterface {
    name = 'FixedConnectionsOfTables1759519252213'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_db8bf52b9900c5a1fb4c5796375"`);
        await queryRunner.query(`ALTER TABLE "edges" DROP CONSTRAINT "FK_14f679a0c2578dad14fdf2913ec"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP COLUMN "start_node"`);
        await queryRunner.query(`ALTER TABLE "edges" DROP COLUMN "source"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD "start_node_id" integer`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD "end_node_id" integer`);
        await queryRunner.query(`ALTER TABLE "edges" ADD "source_id" integer`);
        await queryRunner.query(`ALTER TABLE "edges" ADD "target_id" integer`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_08210dda6353b3bc2579acf9cff" FOREIGN KEY ("start_node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_e3ac1f3f68a3129031631b88745" FOREIGN KEY ("end_node_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "edges" ADD CONSTRAINT "FK_cf6a8dd0c8ddb23564d38909bec" FOREIGN KEY ("source_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "edges" ADD CONSTRAINT "FK_f69f63f2300a02b50a19a6eee68" FOREIGN KEY ("target_id") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "edges" DROP CONSTRAINT "FK_f69f63f2300a02b50a19a6eee68"`);
        await queryRunner.query(`ALTER TABLE "edges" DROP CONSTRAINT "FK_cf6a8dd0c8ddb23564d38909bec"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_e3ac1f3f68a3129031631b88745"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP CONSTRAINT "FK_08210dda6353b3bc2579acf9cff"`);
        await queryRunner.query(`ALTER TABLE "edges" DROP COLUMN "target_id"`);
        await queryRunner.query(`ALTER TABLE "edges" DROP COLUMN "source_id"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP COLUMN "end_node_id"`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" DROP COLUMN "start_node_id"`);
        await queryRunner.query(`ALTER TABLE "edges" ADD "source" integer`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD "start_node" integer`);
        await queryRunner.query(`ALTER TABLE "edges" ADD CONSTRAINT "FK_14f679a0c2578dad14fdf2913ec" FOREIGN KEY ("source") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "evacuation_route" ADD CONSTRAINT "FK_db8bf52b9900c5a1fb4c5796375" FOREIGN KEY ("start_node") REFERENCES "nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
