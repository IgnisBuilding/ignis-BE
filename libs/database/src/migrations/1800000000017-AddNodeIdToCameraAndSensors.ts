import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeIdToCameraAndSensors1800000000017 implements MigrationInterface {
  name = 'AddNodeIdToCameraAndSensors1800000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add node_id to camera for routing integration
    await queryRunner.query(`
      ALTER TABLE "camera" ADD COLUMN "node_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "camera"
      ADD CONSTRAINT "FK_camera_node"
      FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`CREATE INDEX "IDX_camera_node_id" ON "camera" ("node_id")`);

    // Add node_id to sensors for routing integration
    await queryRunner.query(`
      ALTER TABLE "sensors" ADD COLUMN "node_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "FK_sensors_node"
      FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`CREATE INDEX "IDX_sensors_node_id" ON "sensors" ("node_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop sensors node_id
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sensors_node_id"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP CONSTRAINT IF EXISTS "FK_sensors_node"`);
    await queryRunner.query(`ALTER TABLE "sensors" DROP COLUMN IF EXISTS "node_id"`);

    // Drop camera node_id
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_camera_node_id"`);
    await queryRunner.query(`ALTER TABLE "camera" DROP CONSTRAINT IF EXISTS "FK_camera_node"`);
    await queryRunner.query(`ALTER TABLE "camera" DROP COLUMN IF EXISTS "node_id"`);
  }
}
