import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFireAlertConfigTable1706300000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create fire_alert_config table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.fire_alert_config (
        id SERIAL NOT NULL,
        building_id INTEGER NOT NULL,
        min_confidence NUMERIC(5, 4) DEFAULT 0.7000,
        consecutive_detections INTEGER DEFAULT 3,
        cooldown_seconds INTEGER DEFAULT 60,
        auto_create_hazard BOOLEAN DEFAULT true,
        auto_notify_firefighters BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fire_alert_config" PRIMARY KEY (id),
        CONSTRAINT "FK_fire_alert_config_building" FOREIGN KEY (building_id) REFERENCES public.building(id) ON DELETE CASCADE,
        CONSTRAINT "UQ_fire_alert_config_building" UNIQUE (building_id)
      )
    `);

    // Create index for building lookup
    await queryRunner.query(`
      CREATE INDEX idx_fire_alert_config_building ON public.fire_alert_config(building_id)
    `);

    console.log('Created fire_alert_config table with index');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index first
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fire_alert_config_building`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS public.fire_alert_config`);

    console.log('Dropped fire_alert_config table');
  }
}
