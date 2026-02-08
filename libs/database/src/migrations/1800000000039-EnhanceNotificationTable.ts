import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceNotificationTable1800000000039 implements MigrationInterface {
  name = 'EnhanceNotificationTable1800000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add title column
    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD COLUMN IF NOT EXISTS "title" varchar NOT NULL DEFAULT 'Notification'
    `);

    // Add priority column
    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD COLUMN IF NOT EXISTS "priority" varchar NOT NULL DEFAULT 'medium'
    `);

    // Add role_target column (for role-broadcast notifications)
    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD COLUMN IF NOT EXISTS "role_target" varchar
    `);

    // Make user_id nullable (role-broadcast notifications have no specific user)
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "user_id" DROP NOT NULL
    `);

    // Add indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_role_target" ON "notification" ("role_target")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_priority" ON "notification" ("priority")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_role_target"`);
    await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "user_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "role_target"`);
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "priority"`);
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN IF EXISTS "title"`);
  }
}
