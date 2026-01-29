import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedTestCamera1800000000033 implements MigrationInterface {
  name = 'SeedTestCamera1800000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if camera with camera_id 'cam1' already exists
    const existingCamera = await queryRunner.query(`
      SELECT id FROM camera WHERE camera_id = 'cam1'
    `);

    if (existingCamera.length > 0) {
      console.log('Camera with camera_id "cam1" already exists, skipping seed');
      return;
    }

    // Get the first available building
    const buildings = await queryRunner.query(`
      SELECT id, name FROM building ORDER BY id LIMIT 1
    `);

    if (buildings.length === 0) {
      console.log('No buildings found. Please create a building first.');
      return;
    }

    const buildingId = buildings[0].id;
    console.log(`Using building: ${buildings[0].name} (ID: ${buildingId})`);

    // Get the first floor for this building
    const floors = await queryRunner.query(`
      SELECT id, name, level FROM floor WHERE building_id = $1 ORDER BY level, id LIMIT 1
    `, [buildingId]);

    let floorId: number | null = null;
    if (floors.length > 0) {
      floorId = floors[0].id;
      console.log(`Using floor: ${floors[0].name} (ID: ${floorId})`);
    }

    // Get the first room for this floor (if floor exists)
    let roomId: number | null = null;
    if (floorId) {
      const rooms = await queryRunner.query(`
        SELECT id, name FROM room WHERE floor_id = $1 ORDER BY id LIMIT 1
      `, [floorId]);

      if (rooms.length > 0) {
        roomId = rooms[0].id;
        console.log(`Using room: ${rooms[0].name} (ID: ${roomId})`);
      }
    }

    // Insert the test camera
    await queryRunner.query(`
      INSERT INTO camera (
        name,
        camera_id,
        rtsp_url,
        building_id,
        floor_id,
        room_id,
        status,
        location_description,
        is_fire_detection_enabled,
        created_at,
        updated_at
      ) VALUES (
        'Test Fire Detection Camera',
        'cam1',
        'rtsp://192.168.100.7:8080/h264_ulaw.sdp',
        $1,
        $2,
        $3,
        'active',
        'Test camera for fire detection pipeline',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `, [buildingId, floorId, roomId]);

    console.log('Test camera "cam1" created successfully');
    console.log(`  Building ID: ${buildingId}`);
    console.log(`  Floor ID: ${floorId || 'None'}`);
    console.log(`  Room ID: ${roomId || 'None'}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Delete the test camera
    await queryRunner.query(`
      DELETE FROM camera WHERE camera_id = 'cam1'
    `);
    console.log('Test camera "cam1" deleted');
  }
}
