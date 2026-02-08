import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSettingsTable1800000000038 implements MigrationInterface {
  name = 'CreateUserSettingsTable1800000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_settings" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL UNIQUE,
        "theme" varchar NOT NULL DEFAULT 'light',
        "language" varchar NOT NULL DEFAULT 'en',
        "compact_mode" boolean NOT NULL DEFAULT false,
        "high_contrast" boolean NOT NULL DEFAULT false,
        "notify_push" boolean NOT NULL DEFAULT true,
        "notify_email" boolean NOT NULL DEFAULT true,
        "notify_sms" boolean NOT NULL DEFAULT true,
        "notify_maintenance" boolean NOT NULL DEFAULT true,
        "notify_community" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_user_settings_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_settings"`);
  }
}
