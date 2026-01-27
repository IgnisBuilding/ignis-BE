import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1800000000006 implements MigrationInterface {
  name = 'AddPerformanceIndexes1800000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === HAZARDS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_status" ON "hazards" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_severity" ON "hazards" ("severity")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_type" ON "hazards" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_created_at" ON "hazards" ("created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_apartment_id" ON "hazards" ("apartment_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_hazards_node_id" ON "hazards" ("node_id")`);

    // === TRAPPED_OCCUPANTS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trapped_occupants_status" ON "trapped_occupants" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trapped_occupants_priority_level" ON "trapped_occupants" ("priority_level")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trapped_occupants_priority_score" ON "trapped_occupants" ("priority_score" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trapped_occupants_floor_id" ON "trapped_occupants" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_trapped_occupants_assigned_team_id" ON "trapped_occupants" ("assigned_team_id")`);

    // === RESCUE_TEAMS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_rescue_teams_status" ON "rescue_teams" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_rescue_teams_current_floor_id" ON "rescue_teams" ("current_floor_id")`);

    // === SENSORS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sensors_status" ON "sensors" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sensors_type" ON "sensors" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sensors_room_id" ON "sensors" ("room_id")`);

    // === CAMERA TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_camera_status" ON "camera" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_camera_building_id" ON "camera" ("building_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_camera_floor_id" ON "camera" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_camera_is_fire_detection_enabled" ON "camera" ("is_fire_detection_enabled")`);

    // === FIRE_DETECTION_LOG TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fire_detection_log_camera_id" ON "fire_detection_log" ("camera_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fire_detection_log_detection_timestamp" ON "fire_detection_log" ("detection_timestamp" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fire_detection_log_alert_triggered" ON "fire_detection_log" ("alert_triggered")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fire_detection_log_hazard_id" ON "fire_detection_log" ("hazard_id")`);

    // === NODES TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_nodes_floor_id" ON "nodes" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_nodes_type" ON "nodes" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_nodes_apartment_id" ON "nodes" ("apartment_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_nodes_room_id" ON "nodes" ("room_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_nodes_is_accessible" ON "nodes" ("is_accessible")`);

    // === EDGES TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_edges_source_id" ON "edges" ("source_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_edges_target_id" ON "edges" ("target_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_edges_is_emergency_route" ON "edges" ("is_emergency_route")`);

    // === ROOM TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_room_floor_id" ON "room" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_room_apartment_id" ON "room" ("apartment_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_room_type" ON "room" ("type")`);

    // === APARTMENT TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_apartment_floor_id" ON "apartment" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_apartment_user_id" ON "apartment" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_apartment_occupied" ON "apartment" ("occupied")`);

    // === FLOOR TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_floor_building_id" ON "floor" ("building_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_floor_level" ON "floor" ("level")`);

    // === USERS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users" ("role")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_is_active" ON "users" ("is_active")`);

    // === EXITS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_exits_floor_id" ON "exits" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_exits_type" ON "exits" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_exits_node_id" ON "exits" ("node_id")`);

    // === SAFE_POINTS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_safe_points_floor_id" ON "safe_points" ("floor_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_safe_points_priority" ON "safe_points" ("priority")`);

    // === ISOLATION_EVENTS TABLE INDEXES ===
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_isolation_events_event_type" ON "isolation_events" ("event_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_isolation_events_event_at" ON "isolation_events" ("event_at" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_isolation_events_hazard_id" ON "isolation_events" ("hazard_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all created indexes
    const indexes = [
      'IDX_hazards_status', 'IDX_hazards_severity', 'IDX_hazards_type', 'IDX_hazards_created_at',
      'IDX_hazards_apartment_id', 'IDX_hazards_node_id',
      'IDX_trapped_occupants_status', 'IDX_trapped_occupants_priority_level',
      'IDX_trapped_occupants_priority_score', 'IDX_trapped_occupants_floor_id',
      'IDX_trapped_occupants_assigned_team_id',
      'IDX_rescue_teams_status', 'IDX_rescue_teams_current_floor_id',
      'IDX_sensors_status', 'IDX_sensors_type', 'IDX_sensors_room_id',
      'IDX_camera_status', 'IDX_camera_building_id', 'IDX_camera_floor_id',
      'IDX_camera_is_fire_detection_enabled',
      'IDX_fire_detection_log_camera_id', 'IDX_fire_detection_log_detection_timestamp',
      'IDX_fire_detection_log_alert_triggered', 'IDX_fire_detection_log_hazard_id',
      'IDX_nodes_floor_id', 'IDX_nodes_type', 'IDX_nodes_apartment_id',
      'IDX_nodes_room_id', 'IDX_nodes_is_accessible',
      'IDX_edges_source_id', 'IDX_edges_target_id', 'IDX_edges_is_emergency_route',
      'IDX_room_floor_id', 'IDX_room_apartment_id', 'IDX_room_type',
      'IDX_apartment_floor_id', 'IDX_apartment_user_id', 'IDX_apartment_occupied',
      'IDX_floor_building_id', 'IDX_floor_level',
      'IDX_users_role', 'IDX_users_is_active',
      'IDX_exits_floor_id', 'IDX_exits_type', 'IDX_exits_node_id',
      'IDX_safe_points_floor_id', 'IDX_safe_points_priority',
      'IDX_isolation_events_event_type', 'IDX_isolation_events_event_at', 'IDX_isolation_events_hazard_id'
    ];

    for (const idx of indexes) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${idx}"`);
    }
  }
}
