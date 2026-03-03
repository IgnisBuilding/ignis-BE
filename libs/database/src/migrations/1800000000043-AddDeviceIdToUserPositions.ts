import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceIdToUserPositions1800000000043
  implements MigrationInterface
{
  name = 'AddDeviceIdToUserPositions1800000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add device_id column to user_positions for anonymous Android users
    await queryRunner.query(`
      ALTER TABLE user_positions
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
    `);

    // Make user_id nullable (anonymous users don't have a user record)
    await queryRunner.query(`
      ALTER TABLE user_positions
      ALTER COLUMN user_id DROP NOT NULL;
    `);

    // Drop the existing unique constraint on user_id (one position per user)
    // and replace with a constraint that allows device_id-based uniqueness too
    await queryRunner.query(`
      DROP INDEX IF EXISTS user_positions_user_id_key;
    `);
    await queryRunner.query(`
      ALTER TABLE user_positions
      DROP CONSTRAINT IF EXISTS user_positions_user_id_key;
    `);

    // Create unique index: one active position per user OR per device
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_positions_user_unique
      ON user_positions (user_id) WHERE user_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_positions_device_unique
      ON user_positions (device_id) WHERE device_id IS NOT NULL AND user_id IS NULL;
    `);

    // Add device_id and position_source columns to user_position_history
    await queryRunner.query(`
      ALTER TABLE user_position_history
      ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);
    `);
    await queryRunner.query(`
      ALTER TABLE user_position_history
      ADD COLUMN IF NOT EXISTS position_source VARCHAR(20);
    `);

    // Make user_id nullable in history table too
    await queryRunner.query(`
      ALTER TABLE user_position_history
      ALTER COLUMN user_id DROP NOT NULL;
    `);

    // Index for device-based history lookup
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_position_history_device_time
      ON user_position_history (device_id, timestamp DESC)
      WHERE device_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_position_history_device_time;
    `);
    await queryRunner.query(`
      ALTER TABLE user_position_history
      DROP COLUMN IF EXISTS position_source;
    `);
    await queryRunner.query(`
      ALTER TABLE user_position_history
      DROP COLUMN IF EXISTS device_id;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_positions_device_unique;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_user_positions_user_unique;
    `);
    await queryRunner.query(`
      ALTER TABLE user_positions
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE user_positions
      DROP COLUMN IF EXISTS device_id;
    `);
  }
}
