import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCameraTable1706300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create camera table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.camera (
        id SERIAL NOT NULL,
        name VARCHAR(100) NOT NULL,
        rtsp_url VARCHAR(500) NOT NULL,
        camera_id VARCHAR(50) NOT NULL UNIQUE,
        building_id INTEGER NOT NULL,
        floor_id INTEGER,
        room_id INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        location_description VARCHAR(255),
        geometry geometry(Point, 3857),
        is_fire_detection_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_camera" PRIMARY KEY (id),
        CONSTRAINT "FK_camera_building" FOREIGN KEY (building_id) REFERENCES public.building(id) ON DELETE CASCADE,
        CONSTRAINT "FK_camera_floor" FOREIGN KEY (floor_id) REFERENCES public.floor(id) ON DELETE SET NULL,
        CONSTRAINT "FK_camera_room" FOREIGN KEY (room_id) REFERENCES public.room(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for faster queries
    await queryRunner.query(`
      CREATE INDEX idx_camera_building ON public.camera(building_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_camera_floor ON public.camera(floor_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_camera_room ON public.camera(room_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_camera_camera_id ON public.camera(camera_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_camera_status ON public.camera(status)
    `);

    console.log('Created camera table with indexes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_camera_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_room`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_floor`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_building`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS public.camera`);

    console.log('Dropped camera table');
  }
}
