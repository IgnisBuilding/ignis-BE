import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Navigation Graph Enhancements for Fire Safety Evacuation System
 *
 * This migration adds:
 * 1. Schema changes to nodes and edges tables for better navigation
 * 2. Safe points table for shelter-in-place locations
 * 3. Corridor and junction nodes for proper indoor routing
 * 4. Corridor-based edges replacing the web topology
 *
 * Purpose: Enable realistic indoor navigation that follows corridors
 * instead of straight-line paths through walls.
 */
export class NavigationGraphEnhancements1733590800000 implements MigrationInterface {
  name = 'NavigationGraphEnhancements1733590800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // PART 1: SCHEMA ENHANCEMENTS
    // ============================================================

    // Add new columns to nodes table
    await queryRunner.query(`
      ALTER TABLE "nodes"
      ADD COLUMN IF NOT EXISTS "node_category" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "is_accessible" BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS "description" TEXT
    `);

    // Add new columns to edges table
    await queryRunner.query(`
      ALTER TABLE "edges"
      ADD COLUMN IF NOT EXISTS "edge_type" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "is_emergency_route" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "width_meters" FLOAT DEFAULT 1.0
    `);

    // ============================================================
    // PART 2: CREATE SAFE POINTS TABLE
    // ============================================================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "safe_points" (
        "id" SERIAL PRIMARY KEY,
        "node_id" INTEGER NOT NULL REFERENCES "nodes"("id") ON DELETE CASCADE,
        "floor_id" INTEGER REFERENCES "floor"("id") ON DELETE SET NULL,
        "priority" INTEGER NOT NULL DEFAULT 1,
        "has_window" BOOLEAN DEFAULT false,
        "has_external_access" BOOLEAN DEFAULT false,
        "is_fire_resistant" BOOLEAN DEFAULT false,
        "has_communication" BOOLEAN DEFAULT true,
        "capacity" INTEGER DEFAULT 4,
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_safe_points_node" UNIQUE ("node_id")
      )
    `);

    // Add unique constraint if it doesn't exist (handles case where table was partially created)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'UQ_safe_points_node' AND table_name = 'safe_points'
        ) THEN
          ALTER TABLE "safe_points" ADD CONSTRAINT "UQ_safe_points_node" UNIQUE ("node_id");
        END IF;
      END $$;
    `);

    // Create index for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_safe_points_floor" ON "safe_points" ("floor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_safe_points_priority" ON "safe_points" ("priority")
    `);

    // ============================================================
    // PART 3: UPDATE EXISTING NODES WITH CATEGORIES
    // ============================================================

    // Update room nodes
    await queryRunner.query(`
      UPDATE nodes SET node_category = 'room'
      WHERE type IN ('room', 'bathroom', 'kitchen', 'bedroom', 'living_room', 'dining_room', 'garage', 'storage')
      AND node_category IS NULL
    `);

    // Update doorway nodes
    await queryRunner.query(`
      UPDATE nodes SET node_category = 'doorway'
      WHERE type = 'doorway' AND node_category IS NULL
    `);

    // Update exit nodes
    await queryRunner.query(`
      UPDATE nodes SET node_category = 'exit'
      WHERE type IN ('exit', 'emergency_exit', 'fire_exit') AND node_category IS NULL
    `);

    // Update stairway nodes
    await queryRunner.query(`
      UPDATE nodes SET node_category = 'stairway'
      WHERE type IN ('stairway', 'stairs', 'stair') AND node_category IS NULL
    `);

    // ============================================================
    // PART 4: ADD CORRIDOR AND JUNCTION NODES
    // ============================================================

    // Ground Floor (floor_id = 1) Corridor Nodes
    // Main horizontal corridor running through the center
    await queryRunner.query(`
      INSERT INTO nodes (type, node_category, geometry, floor_id, description, created_at, updated_at)
      VALUES
        -- Main corridor segments (Ground Floor)
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235172.0, 4978252.0), 3857), 1, 'Ground Floor - Main Corridor West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235170.0, 4978252.0), 3857), 1, 'Ground Floor - Main Corridor Center-West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235168.0, 4978252.0), 3857), 1, 'Ground Floor - Main Corridor Center', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235166.0, 4978252.0), 3857), 1, 'Ground Floor - Main Corridor Center-East', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235164.0, 4978252.0), 3857), 1, 'Ground Floor - Main Corridor East', NOW(), NOW()),

        -- Upper corridor (Ground Floor)
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235172.0, 4978256.0), 3857), 1, 'Ground Floor - Upper Corridor West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235168.0, 4978256.0), 3857), 1, 'Ground Floor - Upper Corridor Center', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235164.0, 4978256.0), 3857), 1, 'Ground Floor - Upper Corridor East', NOW(), NOW()),

        -- Junction nodes (Ground Floor)
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235172.0, 4978254.0), 3857), 1, 'Ground Floor - West Junction', NOW(), NOW()),
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235168.0, 4978254.0), 3857), 1, 'Ground Floor - Central Junction', NOW(), NOW()),
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235164.0, 4978254.0), 3857), 1, 'Ground Floor - East Junction', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO nodes (type, node_category, geometry, floor_id, description, created_at, updated_at)
      VALUES
        -- First Floor (floor_id = 2) Corridor Nodes
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235172.0, 4978252.0), 3857), 2, 'First Floor - Main Corridor West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235170.0, 4978252.0), 3857), 2, 'First Floor - Main Corridor Center-West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235168.0, 4978252.0), 3857), 2, 'First Floor - Main Corridor Center', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235166.0, 4978252.0), 3857), 2, 'First Floor - Main Corridor Center-East', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235164.0, 4978252.0), 3857), 2, 'First Floor - Main Corridor East', NOW(), NOW()),

        -- Upper corridor (First Floor)
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235172.0, 4978256.0), 3857), 2, 'First Floor - Upper Corridor West', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235168.0, 4978256.0), 3857), 2, 'First Floor - Upper Corridor Center', NOW(), NOW()),
        ('corridor', 'corridor', ST_SetSRID(ST_MakePoint(-8235164.0, 4978256.0), 3857), 2, 'First Floor - Upper Corridor East', NOW(), NOW()),

        -- Junction nodes (First Floor)
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235172.0, 4978254.0), 3857), 2, 'First Floor - West Junction', NOW(), NOW()),
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235168.0, 4978254.0), 3857), 2, 'First Floor - Central Junction', NOW(), NOW()),
        ('junction', 'junction', ST_SetSRID(ST_MakePoint(-8235164.0, 4978254.0), 3857), 2, 'First Floor - East Junction', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `);

    // ============================================================
    // PART 5: REBUILD EDGE TOPOLOGY
    // ============================================================

    // First, mark old problematic edges (web topology edges connecting non-adjacent nodes)
    // We'll keep edges that connect:
    // - room to doorway (room_to_door)
    // - doorway to corridor/junction (door_to_corridor)
    // - corridor to corridor (corridor)
    // - corridor to junction (corridor)
    // - stairway connections (stairs)
    // - exit connections (exit)

    // Delete old edges that bypass corridors (direct room-to-room connections)
    await queryRunner.query(`
      DELETE FROM edges
      WHERE id IN (
        SELECT e.id FROM edges e
        JOIN nodes ns ON e.source_id = ns.id
        JOIN nodes nt ON e.target_id = nt.id
        WHERE ns.node_category = 'room' AND nt.node_category = 'room'
        AND ns.id != nt.id
      )
    `);

    // Delete edges connecting rooms directly to exits (should go through doorways)
    await queryRunner.query(`
      DELETE FROM edges
      WHERE id IN (
        SELECT e.id FROM edges e
        JOIN nodes ns ON e.source_id = ns.id
        JOIN nodes nt ON e.target_id = nt.id
        WHERE (ns.node_category = 'room' AND nt.node_category = 'exit')
           OR (ns.node_category = 'exit' AND nt.node_category = 'room')
      )
    `);

    // ============================================================
    // PART 6: CREATE PROPER CORRIDOR-BASED EDGES
    // ============================================================

    // This creates edges using a function to properly connect the navigation graph
    // The edges follow a logical corridor-based topology

    // Create corridor-to-corridor edges (horizontal connections)
    await queryRunner.query(`
      INSERT INTO edges (source_id, target_id, cost, edge_type, geometry, created_at, updated_at)
      SELECT
        n1.id as source_id,
        n2.id as target_id,
        CEIL(ST_Distance(n1.geometry, n2.geometry))::integer as cost,
        'corridor' as edge_type,
        ST_MakeLine(n1.geometry, n2.geometry) as geometry,
        NOW() as created_at,
        NOW() as updated_at
      FROM nodes n1
      JOIN nodes n2 ON n1.floor_id = n2.floor_id
      WHERE n1.node_category IN ('corridor', 'junction')
        AND n2.node_category IN ('corridor', 'junction')
        AND n1.id < n2.id
        AND ST_Distance(n1.geometry, n2.geometry) < 500
      ON CONFLICT DO NOTHING
    `);

    // Create doorway-to-corridor/junction edges
    await queryRunner.query(`
      INSERT INTO edges (source_id, target_id, cost, edge_type, geometry, created_at, updated_at)
      SELECT
        d.id as source_id,
        c.id as target_id,
        CEIL(ST_Distance(d.geometry, c.geometry))::integer as cost,
        'door_to_corridor' as edge_type,
        ST_MakeLine(d.geometry, c.geometry) as geometry,
        NOW() as created_at,
        NOW() as updated_at
      FROM nodes d
      JOIN nodes c ON d.floor_id = c.floor_id
      WHERE d.node_category = 'doorway'
        AND c.node_category IN ('corridor', 'junction')
        AND ST_Distance(d.geometry, c.geometry) < 400
      ON CONFLICT DO NOTHING
    `);

    // Create exit-to-corridor edges
    await queryRunner.query(`
      INSERT INTO edges (source_id, target_id, cost, edge_type, geometry, created_at, updated_at)
      SELECT
        ex.id as source_id,
        c.id as target_id,
        CEIL(ST_Distance(ex.geometry, c.geometry))::integer as cost,
        'exit' as edge_type,
        ST_MakeLine(ex.geometry, c.geometry) as geometry,
        NOW() as created_at,
        NOW() as updated_at
      FROM nodes ex
      JOIN nodes c ON ex.floor_id = c.floor_id
      WHERE ex.node_category = 'exit'
        AND c.node_category IN ('corridor', 'junction')
        AND ST_Distance(ex.geometry, c.geometry) < 500
      ON CONFLICT DO NOTHING
    `);

    // Create stairway connections between floors
    await queryRunner.query(`
      INSERT INTO edges (source_id, target_id, cost, edge_type, geometry, created_at, updated_at)
      SELECT
        s1.id as source_id,
        s2.id as target_id,
        100 as cost,
        'stairs' as edge_type,
        ST_MakeLine(s1.geometry, s2.geometry) as geometry,
        NOW() as created_at,
        NOW() as updated_at
      FROM nodes s1
      JOIN nodes s2 ON s1.floor_id != s2.floor_id
      WHERE s1.node_category = 'stairway'
        AND s2.node_category = 'stairway'
        AND s1.id < s2.id
        AND ST_DWithin(s1.geometry, s2.geometry, 50)
      ON CONFLICT DO NOTHING
    `);

    // Update edge types for existing room-to-doorway edges
    await queryRunner.query(`
      UPDATE edges e
      SET edge_type = 'room_to_door'
      FROM nodes ns, nodes nt
      WHERE e.source_id = ns.id
        AND e.target_id = nt.id
        AND e.edge_type IS NULL
        AND ((ns.node_category = 'room' AND nt.node_category = 'doorway')
          OR (ns.node_category = 'doorway' AND nt.node_category = 'room'))
    `);

    // ============================================================
    // PART 7: INSERT SAFE POINTS DATA
    // ============================================================

    await queryRunner.query(`
      INSERT INTO safe_points (node_id, floor_id, priority, has_window, has_external_access, is_fire_resistant, has_communication, capacity, notes)
      SELECT
        n.id,
        n.floor_id,
        CASE
          WHEN n.type IN ('bathroom', 'wc') THEN 1
          WHEN n.type = 'kitchen' THEN 2
          WHEN n.type = 'bedroom' THEN 3
          WHEN n.type = 'living_room' THEN 4
          ELSE 5
        END as priority,
        CASE WHEN n.type IN ('bedroom', 'living_room', 'kitchen') THEN true ELSE false END as has_window,
        false as has_external_access,
        CASE WHEN n.type IN ('bathroom', 'wc') THEN true ELSE false END as is_fire_resistant,
        true as has_communication,
        CASE WHEN n.type IN ('bathroom', 'wc') THEN 2 ELSE 4 END as capacity,
        CONCAT('Safe point in ', n.type, ' - seal doors, call emergency services') as notes
      FROM nodes n
      WHERE n.type IN ('bathroom', 'bedroom', 'kitchen', 'living_room')
        AND n.floor_id IS NOT NULL
      ON CONFLICT ON CONSTRAINT "UQ_safe_points_node" DO NOTHING
    `);

    // ============================================================
    // PART 8: MARK EMERGENCY ROUTES
    // ============================================================

    await queryRunner.query(`
      UPDATE edges SET is_emergency_route = true
      WHERE edge_type IN ('exit', 'stairs', 'corridor')
    `);

    // Set corridor widths
    await queryRunner.query(`
      UPDATE edges SET width_meters = 1.5 WHERE edge_type = 'corridor';
      UPDATE edges SET width_meters = 0.9 WHERE edge_type IN ('door_to_corridor', 'room_to_door');
      UPDATE edges SET width_meters = 1.2 WHERE edge_type = 'stairs';
      UPDATE edges SET width_meters = 1.0 WHERE edge_type = 'exit';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // ROLLBACK: Remove all changes in reverse order
    // ============================================================

    // Drop safe_points table
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_safe_points_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_safe_points_floor"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safe_points"`);

    // Remove corridor and junction nodes
    await queryRunner.query(`
      DELETE FROM nodes WHERE node_category IN ('corridor', 'junction')
    `);

    // Remove new edge types
    await queryRunner.query(`
      DELETE FROM edges WHERE edge_type IN ('corridor', 'door_to_corridor', 'stairs', 'exit')
    `);

    // Remove new columns from edges table
    await queryRunner.query(`
      ALTER TABLE "edges"
      DROP COLUMN IF EXISTS "edge_type",
      DROP COLUMN IF EXISTS "is_emergency_route",
      DROP COLUMN IF EXISTS "width_meters"
    `);

    // Remove new columns from nodes table
    await queryRunner.query(`
      ALTER TABLE "nodes"
      DROP COLUMN IF EXISTS "node_category",
      DROP COLUMN IF EXISTS "is_accessible",
      DROP COLUMN IF EXISTS "description"
    `);
  }
}
