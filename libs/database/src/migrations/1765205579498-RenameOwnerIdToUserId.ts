import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameOwnerIdToUserId1765205579498 implements MigrationInterface {
    name = 'RenameOwnerIdToUserId1765205579498'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename owner_id to user_id
        await queryRunner.query(`ALTER TABLE "apartment" RENAME COLUMN "owner_id" TO "user_id"`);
        
        // Make user_id nullable (since not all apartments may have users assigned)
        await queryRunner.query(`ALTER TABLE "apartment" ALTER COLUMN "user_id" DROP NOT NULL`);
        
        // Add foreign key constraint
        await queryRunner.query(`ALTER TABLE "apartment" ADD CONSTRAINT "FK_apartment_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraint
        await queryRunner.query(`ALTER TABLE "apartment" DROP CONSTRAINT "FK_apartment_user"`);
        
        // Rename back
        await queryRunner.query(`ALTER TABLE "apartment" RENAME COLUMN "user_id" TO "owner_id"`);
        
        // Restore NOT NULL if it was there before
        await queryRunner.query(`ALTER TABLE "apartment" ALTER COLUMN "owner_id" SET NOT NULL`);
    }
}
