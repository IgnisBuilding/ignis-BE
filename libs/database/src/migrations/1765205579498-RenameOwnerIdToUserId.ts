import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameOwnerIdToUserId1765205579498 implements MigrationInterface {
    name = 'RenameOwnerIdToUserId1765205579498'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if column already renamed (migration may have partially run)
        const hasOwnerId = await queryRunner.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'apartment' AND column_name = 'owner_id'
        `);

        if (hasOwnerId.length > 0) {
            // Rename owner_id to user_id
            await queryRunner.query(`ALTER TABLE "apartment" RENAME COLUMN "owner_id" TO "user_id"`);
        }

        // Make user_id nullable (since not all apartments may have users assigned)
        await queryRunner.query(`ALTER TABLE "apartment" ALTER COLUMN "user_id" DROP NOT NULL`);

        // Skip foreign key - users table doesn't exist in this schema
        // await queryRunner.query(`ALTER TABLE "apartment" ADD CONSTRAINT "FK_apartment_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rename back
        await queryRunner.query(`ALTER TABLE "apartment" RENAME COLUMN "user_id" TO "owner_id"`);

        // Restore NOT NULL if it was there before
        await queryRunner.query(`ALTER TABLE "apartment" ALTER COLUMN "owner_id" SET NOT NULL`);
    }
}
