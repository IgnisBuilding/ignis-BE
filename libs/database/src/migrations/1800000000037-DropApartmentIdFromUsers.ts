import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropApartmentIdFromUsers1800000000037 implements MigrationInterface {
  name = 'DropApartmentIdFromUsers1800000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sync: ensure apartment.owner_id is set for any user that had apartment_id
    await queryRunner.query(`
      UPDATE apartment a
      SET owner_id = u.id
      FROM users u
      WHERE u.apartment_id = a.id
        AND a.owner_id IS NULL
    `);

    // Drop the FK constraint if it exists
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_apartment"
    `);

    // Drop the index if it exists
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_apartment_id"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "apartment_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the column
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "apartment_id" integer
    `);

    // Re-add the FK constraint
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "FK_users_apartment"
      FOREIGN KEY ("apartment_id") REFERENCES "apartment"("id") ON DELETE SET NULL
    `);

    // Re-add the index
    await queryRunner.query(`
      CREATE INDEX "IDX_users_apartment_id" ON "users" ("apartment_id")
    `);

    // Sync back: set users.apartment_id from apartment.owner_id
    await queryRunner.query(`
      UPDATE users u
      SET apartment_id = a.id
      FROM apartment a
      WHERE a.owner_id = u.id
    `);
  }
}
