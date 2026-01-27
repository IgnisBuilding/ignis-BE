import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixNotificationDataTypes1800000000003 implements MigrationInterface {
  name = 'FixNotificationDataTypes1800000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix 'message' column: date -> text
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "message" TYPE text USING message::text
    `);

    // Fix 'status' column: date -> varchar
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "status" TYPE character varying USING status::character varying
    `);

    // Fix 'user_id' column: varchar -> integer
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "user_id" TYPE integer USING user_id::integer
    `);

    // Add foreign key constraint for user_id
    await queryRunner.query(`
      ALTER TABLE "notification"
      ADD CONSTRAINT "FK_notification_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

    // Add default value for status
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "status" SET DEFAULT 'unread'
    `);

    // Create index for faster user queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_user_id" ON "notification" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_status" ON "notification" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_user_id"`);

    // Remove foreign key
    await queryRunner.query(`
      ALTER TABLE "notification"
      DROP CONSTRAINT IF EXISTS "FK_notification_user"
    `);

    // Revert column types
    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "message" TYPE date USING NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "status" TYPE date USING NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"
      ALTER COLUMN "user_id" TYPE character varying USING user_id::character varying
    `);
  }
}
