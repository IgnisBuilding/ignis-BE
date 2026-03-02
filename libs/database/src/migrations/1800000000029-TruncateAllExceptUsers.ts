import { MigrationInterface, QueryRunner } from 'typeorm';

export class TruncateAllExceptUsers1800000000029 implements MigrationInterface {
  name = 'TruncateAllExceptUsers1800000000029';

  private async truncateIfExists(queryRunner: QueryRunner, tableName: string): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '${tableName}'
      )
    `);

    if (tableExists[0]?.exists) {
      await queryRunner.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, clear user references to apartments (set apartment_id to NULL)
    await queryRunner.query(`UPDATE "users" SET apartment_id = NULL`);

    // List of all tables to truncate (excluding users)
    const tablesToTruncate = [
      // Junction/log tables
      'trapped_occupant_blocking_hazard',
      'opening_room',
      'sensor_log',
      'fire_detection_log',
      'incident_log',
      'meter_reading',
      'bill_split',
      // Dependent tables
      'trapped_occupants',
      'hazards',
      'alert',
      'notification',
      'payment',
      'bill',
      'meter',
      'ammenity_booking',
      'ammenity',
      // Fire brigade related
      'fire_brigade_state',
      'fire_brigade',
      'fire_brigade_hq',
      'rescue_teams',
      'fire_alert_config',
      // Building infrastructure
      'sensor',
      'camera',
      'safety_equipment',
      'opening',
      'safe_point',
      'evacuation_route',
      'isolation_events',
      // Navigation graph
      'edges',
      'nodes',
      // Room and feature
      'feature',
      'room',
      // Building hierarchy
      'apartment',
      'floor',
      'building',
      // Other
      'employee',
      'society',
    ];

    for (const table of tablesToTruncate) {
      await this.truncateIfExists(queryRunner, table);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore truncated data - this is a destructive migration
    console.warn('Cannot restore truncated data. This migration is irreversible.');
  }
}
