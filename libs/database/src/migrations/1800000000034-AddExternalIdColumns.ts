import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalIdColumns1800000000034 implements MigrationInterface {
  name = 'AddExternalIdColumns1800000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add external_id column to room table
    await queryRunner.query(`
      ALTER TABLE room ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_room_external_id ON room(external_id)
    `);

    // Add external_id column to opening table
    await queryRunner.query(`
      ALTER TABLE opening ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_opening_external_id ON opening(external_id)
    `);

    // Add external_id column to camera table
    await queryRunner.query(`
      ALTER TABLE camera ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_camera_external_id ON camera(external_id)
    `);

    // Add external_id column to nodes table
    await queryRunner.query(`
      ALTER TABLE nodes ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_nodes_external_id ON nodes(external_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_room_external_id`);
    await queryRunner.query(`ALTER TABLE room DROP COLUMN IF EXISTS external_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_opening_external_id`);
    await queryRunner.query(`ALTER TABLE opening DROP COLUMN IF EXISTS external_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_external_id`);
    await queryRunner.query(`ALTER TABLE camera DROP COLUMN IF EXISTS external_id`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_nodes_external_id`);
    await queryRunner.query(`ALTER TABLE nodes DROP COLUMN IF EXISTS external_id`);
  }
}
