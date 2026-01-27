import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFireDetectionLogTable1706300000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create fire_detection_log table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.fire_detection_log (
        id SERIAL NOT NULL,
        camera_id INTEGER NOT NULL,
        camera_code VARCHAR(50) NOT NULL,
        detection_timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        confidence NUMERIC(5, 4) NOT NULL,
        bounding_box JSONB,
        inference_latency NUMERIC(6, 3),
        alert_triggered BOOLEAN DEFAULT false,
        hazard_id INTEGER,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fire_detection_log" PRIMARY KEY (id),
        CONSTRAINT "FK_fire_detection_camera" FOREIGN KEY (camera_id) REFERENCES public.camera(id) ON DELETE CASCADE,
        CONSTRAINT "FK_fire_detection_hazard" FOREIGN KEY (hazard_id) REFERENCES public.hazards(id) ON DELETE SET NULL
      )
    `);

    // Create indexes for faster queries
    await queryRunner.query(`
      CREATE INDEX idx_fire_detection_camera ON public.fire_detection_log(camera_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_fire_detection_timestamp ON public.fire_detection_log(detection_timestamp)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_fire_detection_alert ON public.fire_detection_log(alert_triggered)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_fire_detection_camera_code ON public.fire_detection_log(camera_code)
    `);

    console.log('Created fire_detection_log table with indexes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fire_detection_camera_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fire_detection_alert`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fire_detection_timestamp`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fire_detection_camera`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS public.fire_detection_log`);

    console.log('Dropped fire_detection_log table');
  }
}
