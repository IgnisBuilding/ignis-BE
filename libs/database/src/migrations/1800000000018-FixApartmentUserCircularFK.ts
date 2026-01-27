import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixApartmentUserCircularFK1800000000018 implements MigrationInterface {
  name = 'FixApartmentUserCircularFK1800000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename apartment.user_id to apartment.owner_id for clearer semantics
    // apartment.owner_id = Who owns this unit
    // users.apartment_id = Where this user currently resides (could be different from owned)

    // First, drop the existing foreign key constraint if it exists
    await queryRunner.query(`
      ALTER TABLE "apartment" DROP CONSTRAINT IF EXISTS "FK_apartment_user"
    `);

    // Rename the column
    await queryRunner.query(`
      ALTER TABLE "apartment" RENAME COLUMN "user_id" TO "owner_id"
    `);

    // Re-add the foreign key with new name
    await queryRunner.query(`
      ALTER TABLE "apartment"
      ADD CONSTRAINT "FK_apartment_owner"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Rename the index if it exists
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apartment_user_id"`);
    await queryRunner.query(`CREATE INDEX "IDX_apartment_owner_id" ON "apartment" ("owner_id")`);

    // Add comment to clarify the relationship
    await queryRunner.query(`
      COMMENT ON COLUMN "apartment"."owner_id" IS 'The owner of this apartment unit'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "users"."apartment_id" IS 'The apartment where this user currently resides (may differ from owned apartment)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove comments
    await queryRunner.query(`COMMENT ON COLUMN "users"."apartment_id" IS NULL`);
    await queryRunner.query(`COMMENT ON COLUMN "apartment"."owner_id" IS NULL`);

    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apartment_owner_id"`);

    // Drop FK
    await queryRunner.query(`ALTER TABLE "apartment" DROP CONSTRAINT IF EXISTS "FK_apartment_owner"`);

    // Rename column back
    await queryRunner.query(`ALTER TABLE "apartment" RENAME COLUMN "owner_id" TO "user_id"`);

    // Re-add original FK
    await queryRunner.query(`
      ALTER TABLE "apartment"
      ADD CONSTRAINT "FK_apartment_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Re-add original index
    await queryRunner.query(`CREATE INDEX "IDX_apartment_user_id" ON "apartment" ("user_id")`);
  }
}
