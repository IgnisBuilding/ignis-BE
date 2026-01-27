import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingCheckConstraints1800000000022 implements MigrationInterface {
  name = 'AddMissingCheckConstraints1800000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === NOTIFICATION ===
    // Normalize status to lowercase
    await queryRunner.query(`UPDATE "notification" SET status = LOWER(status) WHERE status != LOWER(status)`);

    // Map unknown notification statuses to 'unread'
    await queryRunner.query(`
      UPDATE "notification" SET status = 'unread'
      WHERE status NOT IN ('unread', 'read', 'archived', 'dismissed')
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD CONSTRAINT "CHK_notification_status"
      CHECK (status IN ('unread', 'read', 'archived', 'dismissed'))
    `);

    // Map unknown notification types to 'info'
    await queryRunner.query(`
      UPDATE "notification" SET type = 'info'
      WHERE type NOT IN ('fire_alert', 'evacuation', 'system', 'maintenance', 'emergency', 'info', 'warning')
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD CONSTRAINT "CHK_notification_type"
      CHECK (type IN ('fire_alert', 'evacuation', 'system', 'maintenance', 'emergency', 'info', 'warning'))
    `);

    // === HAZARDS TYPE ===
    // Normalize type to lowercase
    await queryRunner.query(`UPDATE "hazards" SET type = LOWER(type) WHERE type != LOWER(type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "hazards" SET type = 'other'
      WHERE type NOT IN ('fire', 'smoke', 'gas_leak', 'structural', 'electrical', 'chemical', 'flood', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "hazards"
      ADD CONSTRAINT "CHK_hazards_type"
      CHECK (type IN ('fire', 'smoke', 'gas_leak', 'structural', 'electrical', 'chemical', 'flood', 'other'))
    `);

    // === NODES ===
    // Normalize type to lowercase
    await queryRunner.query(`UPDATE "nodes" SET type = LOWER(type) WHERE type != LOWER(type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "nodes" SET type = 'other'
      WHERE type NOT IN ('room', 'corridor', 'staircase', 'elevator', 'exit', 'entrance', 'junction', 'door', 'window', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "nodes"
      ADD CONSTRAINT "CHK_nodes_type"
      CHECK (type IN ('room', 'corridor', 'staircase', 'elevator', 'exit', 'entrance', 'junction', 'door', 'window', 'other'))
    `);

    // Normalize node_category to lowercase
    await queryRunner.query(`UPDATE "nodes" SET node_category = LOWER(node_category) WHERE node_category IS NOT NULL AND node_category != LOWER(node_category)`);

    // Map unknown categories to 'other'
    await queryRunner.query(`
      UPDATE "nodes" SET node_category = 'other'
      WHERE node_category IS NOT NULL
        AND node_category NOT IN ('navigation', 'exit', 'safe_point', 'hazard', 'sensor', 'equipment', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "nodes"
      ADD CONSTRAINT "CHK_nodes_category"
      CHECK (node_category IS NULL OR node_category IN ('navigation', 'exit', 'safe_point', 'hazard', 'sensor', 'equipment', 'other'))
    `);

    // === BUILDING ===
    // Normalize type to lowercase
    await queryRunner.query(`UPDATE "building" SET type = LOWER(type) WHERE type != LOWER(type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "building" SET type = 'other'
      WHERE type NOT IN ('residential', 'commercial', 'industrial', 'educational', 'healthcare', 'mixed_use', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "building"
      ADD CONSTRAINT "CHK_building_type"
      CHECK (type IN ('residential', 'commercial', 'industrial', 'educational', 'healthcare', 'mixed_use', 'other'))
    `);

    // === ROOM ===
    // Normalize type to lowercase
    await queryRunner.query(`UPDATE "room" SET type = LOWER(type) WHERE type != LOWER(type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "room" SET type = 'other'
      WHERE type NOT IN ('bedroom', 'bathroom', 'kitchen', 'living_room', 'dining_room', 'office', 'storage', 'utility', 'hallway', 'lobby', 'stairwell', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "room"
      ADD CONSTRAINT "CHK_room_type"
      CHECK (type IN ('bedroom', 'bathroom', 'kitchen', 'living_room', 'dining_room', 'office', 'storage', 'utility', 'hallway', 'lobby', 'stairwell', 'other'))
    `);

    // === FEATURES ===
    // Normalize type to lowercase
    await queryRunner.query(`UPDATE "features" SET type = LOWER(type) WHERE type != LOWER(type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "features" SET type = 'other'
      WHERE type NOT IN ('door', 'window', 'wall', 'pillar', 'furniture', 'fire_extinguisher', 'fire_alarm', 'sprinkler', 'emergency_light', 'sign', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "features"
      ADD CONSTRAINT "CHK_features_type"
      CHECK (type IN ('door', 'window', 'wall', 'pillar', 'furniture', 'fire_extinguisher', 'fire_alarm', 'sprinkler', 'emergency_light', 'sign', 'other'))
    `);

    // === EDGES ===
    // Normalize edge_type to lowercase
    await queryRunner.query(`UPDATE "edges" SET edge_type = LOWER(edge_type) WHERE edge_type IS NOT NULL AND edge_type != LOWER(edge_type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "edges" SET edge_type = 'other'
      WHERE edge_type IS NOT NULL
        AND edge_type NOT IN ('corridor', 'door', 'staircase', 'elevator', 'ramp', 'ladder', 'emergency_exit', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "edges"
      ADD CONSTRAINT "CHK_edges_type"
      CHECK (edge_type IS NULL OR edge_type IN ('corridor', 'door', 'staircase', 'elevator', 'ramp', 'ladder', 'emergency_exit', 'other'))
    `);

    // === ISOLATION EVENTS ===
    // Normalize event_type to lowercase
    await queryRunner.query(`UPDATE "isolation_events" SET event_type = LOWER(event_type) WHERE event_type != LOWER(event_type)`);

    // Map unknown types to 'other'
    await queryRunner.query(`
      UPDATE "isolation_events" SET event_type = 'other'
      WHERE event_type NOT IN ('trapped', 'rescued', 'evacuated', 'sheltering', 'hazard_detected', 'route_blocked', 'team_assigned', 'team_arrived', 'other')
    `);

    await queryRunner.query(`
      ALTER TABLE "isolation_events"
      ADD CONSTRAINT "CHK_isolation_events_type"
      CHECK (event_type IN ('trapped', 'rescued', 'evacuated', 'sheltering', 'hazard_detected', 'route_blocked', 'team_assigned', 'team_arrived', 'other'))
    `);

    // === SENSORS STATUS ===
    // Normalize status to lowercase
    await queryRunner.query(`UPDATE "sensors" SET status = LOWER(status) WHERE status != LOWER(status)`);

    // Map unknown statuses to 'inactive'
    await queryRunner.query(`
      UPDATE "sensors" SET status = 'inactive'
      WHERE status NOT IN ('active', 'inactive', 'maintenance', 'faulty', 'offline')
    `);

    await queryRunner.query(`
      ALTER TABLE "sensors"
      ADD CONSTRAINT "CHK_sensors_status"
      CHECK (status IN ('active', 'inactive', 'maintenance', 'faulty', 'offline'))
    `);

    // === CAMERA STATUS ===
    // Normalize status to lowercase
    await queryRunner.query(`UPDATE "camera" SET status = LOWER(status) WHERE status != LOWER(status)`);

    // Map unknown statuses to 'inactive'
    await queryRunner.query(`
      UPDATE "camera" SET status = 'inactive'
      WHERE status NOT IN ('active', 'inactive', 'maintenance', 'faulty', 'offline')
    `);

    await queryRunner.query(`
      ALTER TABLE "camera"
      ADD CONSTRAINT "CHK_camera_status"
      CHECK (status IN ('active', 'inactive', 'maintenance', 'faulty', 'offline'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all CHECK constraints
    const constraints = [
      { table: 'notification', name: 'CHK_notification_status' },
      { table: 'notification', name: 'CHK_notification_type' },
      { table: 'hazards', name: 'CHK_hazards_type' },
      { table: 'nodes', name: 'CHK_nodes_type' },
      { table: 'nodes', name: 'CHK_nodes_category' },
      { table: 'building', name: 'CHK_building_type' },
      { table: 'room', name: 'CHK_room_type' },
      { table: 'features', name: 'CHK_features_type' },
      { table: 'edges', name: 'CHK_edges_type' },
      { table: 'isolation_events', name: 'CHK_isolation_events_type' },
      { table: 'sensors', name: 'CHK_sensors_status' },
      { table: 'camera', name: 'CHK_camera_status' },
    ];

    for (const c of constraints) {
      await queryRunner.query(`ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}"`);
    }
  }
}
