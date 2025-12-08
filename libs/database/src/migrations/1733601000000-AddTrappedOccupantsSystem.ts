import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Trapped Occupants & Rescue Priority System
 *
 * This migration creates the tables needed for:
 * 1. Tracking isolated/trapped occupants during fire emergencies
 * 2. Managing rescue teams and their assignments
 * 3. Logging isolation events for audit trails
 *
 * Part of the Isolated Node Detection & Rescue Priority System
 */
export class AddTrappedOccupantsSystem1733601000000 implements MigrationInterface {
    name = 'AddTrappedOccupantsSystem1733601000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // =============================================
        // 1. CREATE RESCUE_TEAMS TABLE
        // =============================================
        await queryRunner.query(`
            CREATE TABLE rescue_teams (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(50) NOT NULL,
                team_code VARCHAR(10) UNIQUE NOT NULL,

                -- Team Composition
                member_count INTEGER NOT NULL DEFAULT 4,
                has_medical BOOLEAN DEFAULT false,
                has_heavy_equipment BOOLEAN DEFAULT false,

                -- Current Status
                status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
                current_location VARCHAR(100),
                current_floor_id INTEGER REFERENCES floor(id),

                -- Contact Info
                radio_channel VARCHAR(20),
                leader_contact VARCHAR(20),

                -- Timestamps
                last_status_update TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('Created rescue_teams table');

        // =============================================
        // 2. CREATE TRAPPED_OCCUPANTS TABLE
        // =============================================
        await queryRunner.query(`
            CREATE TABLE trapped_occupants (
                id SERIAL PRIMARY KEY,

                -- Location Information
                node_id INTEGER NOT NULL REFERENCES nodes(id),
                floor_id INTEGER REFERENCES floor(id),
                room_name VARCHAR(100),

                -- Occupant Information
                occupant_count INTEGER DEFAULT 1,
                has_elderly BOOLEAN DEFAULT false,
                has_disabled BOOLEAN DEFAULT false,
                has_children BOOLEAN DEFAULT false,
                contact_number VARCHAR(20),

                -- Isolation Details
                isolation_reason VARCHAR(50) NOT NULL,
                blocking_hazard_ids INTEGER[],
                nearest_fire_distance DECIMAL(10,2),

                -- Priority & Status
                priority_score INTEGER NOT NULL,
                priority_level VARCHAR(20) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'TRAPPED',

                -- Shelter Information
                shelter_instructions TEXT,
                has_window BOOLEAN DEFAULT false,
                has_external_access BOOLEAN DEFAULT false,
                room_capacity INTEGER,

                -- Rescue Assignment
                assigned_team_id INTEGER REFERENCES rescue_teams(id),
                estimated_rescue_time TIMESTAMP,
                actual_rescue_time TIMESTAMP,

                -- Timestamps
                trapped_at TIMESTAMP NOT NULL DEFAULT NOW(),
                last_contact_at TIMESTAMP DEFAULT NOW(),
                rescued_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

                -- Coordinates for quick access (denormalized from node geometry)
                longitude DECIMAL(12,8),
                latitude DECIMAL(12,8)
            );
        `);

        console.log('Created trapped_occupants table');

        // Add foreign key for current_assignment_id in rescue_teams
        await queryRunner.query(`
            ALTER TABLE rescue_teams
            ADD COLUMN current_assignment_id INTEGER REFERENCES trapped_occupants(id);
        `);

        // =============================================
        // 3. CREATE ISOLATION_EVENTS TABLE (Audit Log)
        // =============================================
        await queryRunner.query(`
            CREATE TABLE isolation_events (
                id SERIAL PRIMARY KEY,

                -- Event Details
                event_type VARCHAR(30) NOT NULL,
                node_id INTEGER NOT NULL REFERENCES nodes(id),

                -- References
                hazard_id INTEGER REFERENCES hazards(id),
                trapped_occupant_id INTEGER REFERENCES trapped_occupants(id),
                rescue_team_id INTEGER REFERENCES rescue_teams(id),

                -- Event Data
                details JSONB,

                -- Timestamp
                event_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        console.log('Created isolation_events table');

        // =============================================
        // 4. CREATE INDEXES FOR PERFORMANCE
        // =============================================
        await queryRunner.query(`
            -- Trapped occupants indexes
            CREATE INDEX idx_trapped_occupants_status
                ON trapped_occupants(status);

            CREATE INDEX idx_trapped_occupants_priority
                ON trapped_occupants(priority_level, priority_score DESC);

            CREATE INDEX idx_trapped_occupants_node
                ON trapped_occupants(node_id);

            CREATE INDEX idx_trapped_occupants_floor
                ON trapped_occupants(floor_id);

            CREATE INDEX idx_trapped_occupants_active
                ON trapped_occupants(status, priority_level)
                WHERE status NOT IN ('RESCUED', 'EVACUATED');

            -- Isolation events indexes
            CREATE INDEX idx_isolation_events_node
                ON isolation_events(node_id, event_at DESC);

            CREATE INDEX idx_isolation_events_type
                ON isolation_events(event_type, event_at DESC);

            CREATE INDEX idx_isolation_events_trapped
                ON isolation_events(trapped_occupant_id, event_at DESC);

            -- Rescue teams indexes
            CREATE INDEX idx_rescue_teams_status
                ON rescue_teams(status);
        `);

        console.log('Created indexes');

        // =============================================
        // 5. INSERT DEFAULT RESCUE TEAMS
        // =============================================
        await queryRunner.query(`
            INSERT INTO rescue_teams (team_name, team_code, member_count, has_medical, has_heavy_equipment, radio_channel)
            VALUES
                ('Alpha Team', 'ALPHA', 4, true, false, 'CH-1'),
                ('Bravo Team', 'BRAVO', 4, false, true, 'CH-2'),
                ('Charlie Team', 'CHARLIE', 6, true, true, 'CH-3'),
                ('Delta Team', 'DELTA', 4, false, false, 'CH-4');
        `);

        console.log('Inserted default rescue teams');

        // =============================================
        // 6. CREATE HELPER FUNCTIONS
        // =============================================

        // Function to calculate priority score
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION calculate_rescue_priority(
                p_isolation_reason VARCHAR,
                p_nearest_fire_distance DECIMAL,
                p_has_elderly BOOLEAN,
                p_has_disabled BOOLEAN,
                p_has_children BOOLEAN,
                p_occupant_count INTEGER,
                p_has_window BOOLEAN,
                p_has_external_access BOOLEAN
            ) RETURNS INTEGER AS $$
            DECLARE
                v_score INTEGER := 0;
            BEGIN
                -- Base score by isolation reason
                CASE p_isolation_reason
                    WHEN 'LOCATION_ON_FIRE' THEN v_score := 200;
                    WHEN 'FIRE_BLOCKED_ALL_EXITS' THEN v_score := 150;
                    WHEN 'FIRE_BLOCKED_EXITS_HAS_SAFE_POINT' THEN v_score := 100;
                    WHEN 'STRUCTURAL_COLLAPSE' THEN v_score := 180;
                    WHEN 'SMOKE_FILLED_CORRIDORS' THEN v_score := 120;
                    ELSE v_score := 50;
                END CASE;

                -- Fire proximity bonus (closer = higher priority)
                IF p_nearest_fire_distance IS NOT NULL AND p_nearest_fire_distance > 0 THEN
                    v_score := v_score + LEAST(ROUND(50.0 / p_nearest_fire_distance)::INTEGER, 50);
                END IF;

                -- Vulnerable occupant bonuses
                IF p_has_elderly THEN v_score := v_score + 30; END IF;
                IF p_has_disabled THEN v_score := v_score + 30; END IF;
                IF p_has_children THEN v_score := v_score + 20; END IF;

                -- Multiple occupants bonus
                IF p_occupant_count > 1 THEN
                    v_score := v_score + LEAST(p_occupant_count * 5, 25);
                END IF;

                -- Room factors (harder to rescue = higher priority)
                IF NOT p_has_window THEN v_score := v_score + 15; END IF;
                IF NOT p_has_external_access THEN v_score := v_score + 10; END IF;

                RETURN v_score;
            END;
            $$ LANGUAGE plpgsql IMMUTABLE;
        `);

        console.log('Created calculate_rescue_priority function');

        // Function to get priority level from score
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION get_priority_level(p_score INTEGER)
            RETURNS VARCHAR AS $$
            BEGIN
                IF p_score >= 180 THEN RETURN 'CRITICAL';
                ELSIF p_score >= 120 THEN RETURN 'HIGH';
                ELSIF p_score >= 60 THEN RETURN 'MEDIUM';
                ELSE RETURN 'LOW';
                END IF;
            END;
            $$ LANGUAGE plpgsql IMMUTABLE;
        `);

        console.log('Created get_priority_level function');

        // =============================================
        // 7. CREATE TRIGGER FOR PRIORITY RECALCULATION
        // =============================================
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION recalculate_trapped_priority()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.priority_score := calculate_rescue_priority(
                    NEW.isolation_reason,
                    NEW.nearest_fire_distance,
                    NEW.has_elderly,
                    NEW.has_disabled,
                    NEW.has_children,
                    NEW.occupant_count,
                    NEW.has_window,
                    NEW.has_external_access
                );
                NEW.priority_level := get_priority_level(NEW.priority_score);
                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER trigger_recalculate_priority
            BEFORE INSERT OR UPDATE OF
                isolation_reason, nearest_fire_distance, has_elderly,
                has_disabled, has_children, occupant_count,
                has_window, has_external_access
            ON trapped_occupants
            FOR EACH ROW
            EXECUTE FUNCTION recalculate_trapped_priority();
        `);

        console.log('Created priority recalculation trigger');

        console.log('Migration AddTrappedOccupantsSystem completed successfully');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop trigger
        await queryRunner.query(`
            DROP TRIGGER IF EXISTS trigger_recalculate_priority ON trapped_occupants;
            DROP FUNCTION IF EXISTS recalculate_trapped_priority();
        `);

        // Drop helper functions
        await queryRunner.query(`
            DROP FUNCTION IF EXISTS get_priority_level(INTEGER);
            DROP FUNCTION IF EXISTS calculate_rescue_priority(
                VARCHAR, DECIMAL, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, BOOLEAN, BOOLEAN
            );
        `);

        // Drop indexes
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_rescue_teams_status;
            DROP INDEX IF EXISTS idx_isolation_events_trapped;
            DROP INDEX IF EXISTS idx_isolation_events_type;
            DROP INDEX IF EXISTS idx_isolation_events_node;
            DROP INDEX IF EXISTS idx_trapped_occupants_active;
            DROP INDEX IF EXISTS idx_trapped_occupants_floor;
            DROP INDEX IF EXISTS idx_trapped_occupants_node;
            DROP INDEX IF EXISTS idx_trapped_occupants_priority;
            DROP INDEX IF EXISTS idx_trapped_occupants_status;
        `);

        // Drop tables in correct order (respecting foreign keys)
        await queryRunner.query(`DROP TABLE IF EXISTS isolation_events;`);
        await queryRunner.query(`
            ALTER TABLE rescue_teams DROP COLUMN IF EXISTS current_assignment_id;
        `);
        await queryRunner.query(`DROP TABLE IF EXISTS trapped_occupants;`);
        await queryRunner.query(`DROP TABLE IF EXISTS rescue_teams;`);

        console.log('Migration AddTrappedOccupantsSystem reverted successfully');
    }
}
