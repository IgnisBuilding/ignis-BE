import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Real-Time Navigation Tables
 *
 * Creates tables for:
 * 1. user_positions - Real-time user location tracking
 * 2. navigation_sessions - Active navigation sessions
 * 3. user_position_history - Position history for analytics
 *
 * References existing tables: users, building, floor, nodes
 */
export class AddNavigationTables1800000000035 implements MigrationInterface {
  name = 'AddNavigationTables1800000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =============================================
    // 1. CREATE USER_POSITIONS TABLE
    // =============================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_positions (
        id SERIAL PRIMARY KEY,

        -- User Reference
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

        -- Location References
        building_id INTEGER NOT NULL REFERENCES building(id),
        floor_id INTEGER NOT NULL REFERENCES floor(id),
        nearest_node_id INTEGER REFERENCES nodes(id),

        -- Position Data (local building coordinates)
        x DECIMAL(10,4) NOT NULL,
        y DECIMAL(10,4) NOT NULL,
        geometry GEOMETRY(Point, 3857),

        -- Accuracy & Movement
        accuracy_meters DECIMAL(8,2) NOT NULL DEFAULT 5.0,
        confidence DECIMAL(3,2) DEFAULT 0.5,
        heading DECIMAL(5,2),
        speed DECIMAL(5,2),

        -- Device Sensor Info
        sensor_data JSONB,
        position_source VARCHAR(20) DEFAULT 'wifi',

        -- Navigation Status
        status VARCHAR(20) NOT NULL DEFAULT 'active',

        -- Timestamps
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        -- One active position per user
        CONSTRAINT uq_user_position_active UNIQUE (user_id)
      );
    `);

    console.log('Created user_positions table');

    // =============================================
    // 2. CREATE NAVIGATION_SESSIONS TABLE
    // =============================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS navigation_sessions (
        id SERIAL PRIMARY KEY,

        -- User & Building
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        building_id INTEGER NOT NULL REFERENCES building(id),

        -- Route Endpoints
        start_node_id INTEGER REFERENCES nodes(id),
        start_x DECIMAL(10,4),
        start_y DECIMAL(10,4),
        start_floor_id INTEGER REFERENCES floor(id),

        destination_node_id INTEGER REFERENCES nodes(id),
        destination_type VARCHAR(30) NOT NULL DEFAULT 'nearest_exit',

        -- Route Data
        current_route GEOMETRY(LineString, 3857),
        route_geojson JSONB,
        instructions JSONB,

        -- Progress Tracking
        total_distance DECIMAL(10,2),
        remaining_distance DECIMAL(10,2),
        eta_seconds INTEGER,
        current_instruction_index INTEGER DEFAULT 0,
        progress_percent INTEGER DEFAULT 0,

        -- Session Stats
        reroute_count INTEGER DEFAULT 0,
        last_reroute_reason VARCHAR(50),

        -- Status
        status VARCHAR(20) NOT NULL DEFAULT 'active',

        -- Timestamps
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_position_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Created navigation_sessions table');

    // =============================================
    // 3. CREATE USER_POSITION_HISTORY TABLE
    // =============================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_position_history (
        id SERIAL PRIMARY KEY,

        -- References
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        building_id INTEGER NOT NULL REFERENCES building(id),
        floor_id INTEGER NOT NULL REFERENCES floor(id),
        session_id INTEGER REFERENCES navigation_sessions(id) ON DELETE SET NULL,
        node_id INTEGER REFERENCES nodes(id),

        -- Position
        x DECIMAL(10,4) NOT NULL,
        y DECIMAL(10,4) NOT NULL,
        geometry GEOMETRY(Point, 3857),
        heading DECIMAL(5,2),
        accuracy_meters DECIMAL(8,2),

        -- Timestamp
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Created user_position_history table');

    // =============================================
    // 4. CREATE INDEXES
    // =============================================
    await queryRunner.query(`
      -- User positions indexes
      CREATE INDEX IF NOT EXISTS idx_user_positions_building
        ON user_positions(building_id);

      CREATE INDEX IF NOT EXISTS idx_user_positions_floor
        ON user_positions(floor_id);

      CREATE INDEX IF NOT EXISTS idx_user_positions_status
        ON user_positions(status);

      CREATE INDEX IF NOT EXISTS idx_user_positions_timestamp
        ON user_positions(timestamp DESC);

      -- Navigation sessions indexes
      CREATE INDEX IF NOT EXISTS idx_nav_sessions_user
        ON navigation_sessions(user_id);

      CREATE INDEX IF NOT EXISTS idx_nav_sessions_building
        ON navigation_sessions(building_id);

      CREATE INDEX IF NOT EXISTS idx_nav_sessions_status
        ON navigation_sessions(status);

      -- Position history indexes
      CREATE INDEX IF NOT EXISTS idx_position_history_session
        ON user_position_history(session_id);

      CREATE INDEX IF NOT EXISTS idx_position_history_user_time
        ON user_position_history(user_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_position_history_building_time
        ON user_position_history(building_id, timestamp DESC);
    `);

    console.log('Created indexes');

    // =============================================
    // 5. CREATE UPDATE TRIGGER
    // =============================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_navigation_session_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_nav_session_updated ON navigation_sessions;

      CREATE TRIGGER trigger_nav_session_updated
      BEFORE UPDATE ON navigation_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_navigation_session_timestamp();
    `);

    console.log('Created update trigger');

    // =============================================
    // 6. ADD CHECK CONSTRAINTS
    // =============================================
    await queryRunner.query(`
      ALTER TABLE user_positions
      DROP CONSTRAINT IF EXISTS chk_user_positions_status;

      ALTER TABLE user_positions
      ADD CONSTRAINT chk_user_positions_status
      CHECK (status IN ('active', 'navigating', 'safe', 'trapped', 'offline'));

      ALTER TABLE user_positions
      DROP CONSTRAINT IF EXISTS chk_user_positions_confidence;

      ALTER TABLE user_positions
      ADD CONSTRAINT chk_user_positions_confidence
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

      ALTER TABLE navigation_sessions
      DROP CONSTRAINT IF EXISTS chk_nav_sessions_status;

      ALTER TABLE navigation_sessions
      ADD CONSTRAINT chk_nav_sessions_status
      CHECK (status IN ('active', 'completed', 'aborted', 'trapped'));

      ALTER TABLE navigation_sessions
      DROP CONSTRAINT IF EXISTS chk_nav_sessions_dest_type;

      ALTER TABLE navigation_sessions
      ADD CONSTRAINT chk_nav_sessions_dest_type
      CHECK (destination_type IN ('nearest_exit', 'safe_point', 'specific_node'));

      ALTER TABLE navigation_sessions
      DROP CONSTRAINT IF EXISTS chk_nav_sessions_progress;

      ALTER TABLE navigation_sessions
      ADD CONSTRAINT chk_nav_sessions_progress
      CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));
    `);

    console.log('Added check constraints');

    console.log('Migration AddNavigationTables completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_nav_session_updated ON navigation_sessions;
      DROP FUNCTION IF EXISTS update_navigation_session_timestamp();
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_position_history_building_time;
      DROP INDEX IF EXISTS idx_position_history_user_time;
      DROP INDEX IF EXISTS idx_position_history_session;
      DROP INDEX IF EXISTS idx_nav_sessions_status;
      DROP INDEX IF EXISTS idx_nav_sessions_building;
      DROP INDEX IF EXISTS idx_nav_sessions_user;
      DROP INDEX IF EXISTS idx_user_positions_timestamp;
      DROP INDEX IF EXISTS idx_user_positions_status;
      DROP INDEX IF EXISTS idx_user_positions_floor;
      DROP INDEX IF EXISTS idx_user_positions_building;
    `);

    // Drop tables in correct order
    await queryRunner.query(`DROP TABLE IF EXISTS user_position_history;`);
    await queryRunner.query(`DROP TABLE IF EXISTS navigation_sessions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_positions;`);

    console.log('Migration AddNavigationTables reverted successfully');
  }
}
