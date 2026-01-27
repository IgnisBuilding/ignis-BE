import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameExitsToOpening1800000000024 implements MigrationInterface {
  name = 'RenameExitsToOpening1800000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename exits table to opening
    await queryRunner.query(`ALTER TABLE "exits" RENAME TO "opening"`);

    // 2. Rename the primary key constraint (handle different naming conventions)
    // Get actual constraint name first
    const pkResult = await queryRunner.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'opening' AND constraint_type = 'PRIMARY KEY'
    `);
    if (pkResult.length > 0 && pkResult[0].constraint_name !== 'opening_pkey') {
      await queryRunner.query(`ALTER TABLE "opening" RENAME CONSTRAINT "${pkResult[0].constraint_name}" TO "opening_pkey"`);
    }

    // 3. Rename sequence if exists
    await queryRunner.query(`ALTER SEQUENCE IF EXISTS "exits_id_seq" RENAME TO "opening_id_seq"`);

    // 4. Rename existing foreign key constraints (use IF EXISTS pattern)
    // Get FK constraints for node
    const nodeFkResult = await queryRunner.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'opening' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%node%' OR constraint_name = 'FK_155d054626aae9e009100727d8f'
    `);
    for (const fk of nodeFkResult) {
      if (fk.constraint_name !== 'FK_opening_node') {
        await queryRunner.query(`ALTER TABLE "opening" RENAME CONSTRAINT "${fk.constraint_name}" TO "FK_opening_node"`);
      }
    }

    // Get FK constraints for floor
    const floorFkResult = await queryRunner.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'opening' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%floor%' OR constraint_name = 'FK_dadf13ef3ff0d576d54d9366807'
    `);
    for (const fk of floorFkResult) {
      if (fk.constraint_name !== 'FK_opening_floor') {
        await queryRunner.query(`ALTER TABLE "opening" RENAME CONSTRAINT "${fk.constraint_name}" TO "FK_opening_floor"`);
      }
    }

    // 5. Rename the type column to opening_type
    await queryRunner.query(`ALTER TABLE "opening" RENAME COLUMN "type" TO "opening_type"`);

    // 6. Add new columns
    await queryRunner.query(`ALTER TABLE "opening" ADD COLUMN "width_meters" numeric(5,2)`);
    await queryRunner.query(`ALTER TABLE "opening" ADD COLUMN "color" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "opening" ADD COLUMN "name" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "opening" ADD COLUMN "is_emergency_exit" boolean DEFAULT false`);

    // 7. Make capacity nullable (only needed for exits)
    await queryRunner.query(`ALTER TABLE "opening" ALTER COLUMN "capacity" DROP NOT NULL`);

    // 8. Drop the old CHECK constraint on capacity if exists
    await queryRunner.query(`ALTER TABLE "opening" DROP CONSTRAINT IF EXISTS "CHK_exits_capacity"`);

    // 9. Add new CHECK constraint for capacity (allow NULL or > 0)
    await queryRunner.query(`
      ALTER TABLE "opening"
      ADD CONSTRAINT "CHK_opening_capacity"
      CHECK (capacity IS NULL OR capacity > 0)
    `);

    // 10. Update existing records to mark as emergency exits
    await queryRunner.query(`UPDATE "opening" SET is_emergency_exit = true WHERE opening_type IS NOT NULL`);

    // 11. Normalize opening_type to lowercase
    await queryRunner.query(`UPDATE "opening" SET opening_type = LOWER(opening_type) WHERE opening_type IS NOT NULL`);

    // 12. Add CHECK constraint for opening_type
    await queryRunner.query(`
      ALTER TABLE "opening"
      ADD CONSTRAINT "CHK_opening_type"
      CHECK (opening_type IN ('door', 'emergency_exit', 'window', 'gate', 'other'))
    `);

    // 13. Create junction table for opening-room connections
    await queryRunner.query(`
      CREATE TABLE "opening_rooms" (
        "id" SERIAL PRIMARY KEY,
        "opening_id" integer NOT NULL,
        "room_id" integer NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "FK_opening_rooms_opening" FOREIGN KEY ("opening_id")
          REFERENCES "opening"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_opening_rooms_room" FOREIGN KEY ("room_id")
          REFERENCES "room"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_opening_rooms" UNIQUE ("opening_id", "room_id")
      )
    `);

    // 14. Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_opening_rooms_opening_id" ON "opening_rooms" ("opening_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_opening_rooms_room_id" ON "opening_rooms" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_opening_opening_type" ON "opening" ("opening_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_opening_is_emergency_exit" ON "opening" ("is_emergency_exit")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opening_is_emergency_exit"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opening_opening_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opening_rooms_room_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opening_rooms_opening_id"`);

    // Drop junction table
    await queryRunner.query(`DROP TABLE IF EXISTS "opening_rooms"`);

    // Drop CHECK constraints
    await queryRunner.query(`ALTER TABLE "opening" DROP CONSTRAINT IF EXISTS "CHK_opening_type"`);
    await queryRunner.query(`ALTER TABLE "opening" DROP CONSTRAINT IF EXISTS "CHK_opening_capacity"`);

    // Add back old capacity constraint
    await queryRunner.query(`
      ALTER TABLE "opening"
      ADD CONSTRAINT "CHK_exits_capacity"
      CHECK (capacity > 0)
    `);

    // Make capacity NOT NULL again
    await queryRunner.query(`UPDATE "opening" SET capacity = 1 WHERE capacity IS NULL`);
    await queryRunner.query(`ALTER TABLE "opening" ALTER COLUMN "capacity" SET NOT NULL`);

    // Drop new columns
    await queryRunner.query(`ALTER TABLE "opening" DROP COLUMN IF EXISTS "is_emergency_exit"`);
    await queryRunner.query(`ALTER TABLE "opening" DROP COLUMN IF EXISTS "name"`);
    await queryRunner.query(`ALTER TABLE "opening" DROP COLUMN IF EXISTS "color"`);
    await queryRunner.query(`ALTER TABLE "opening" DROP COLUMN IF EXISTS "width_meters"`);

    // Rename opening_type back to type
    await queryRunner.query(`ALTER TABLE "opening" RENAME COLUMN "opening_type" TO "type"`);

    // Rename foreign key constraints back
    await queryRunner.query(`
      ALTER TABLE "opening"
      RENAME CONSTRAINT "FK_opening_floor" TO "FK_dadf13ef3ff0d576d54d9366807"
    `);
    await queryRunner.query(`
      ALTER TABLE "opening"
      RENAME CONSTRAINT "FK_opening_node" TO "FK_155d054626aae9e009100727d8f"
    `);

    // Rename sequence back
    await queryRunner.query(`ALTER SEQUENCE "opening_id_seq" RENAME TO "exits_id_seq"`);

    // Rename primary key constraint back
    await queryRunner.query(`ALTER TABLE "opening" RENAME CONSTRAINT "opening_pkey" TO "exits_pkey"`);

    // Rename table back to exits
    await queryRunner.query(`ALTER TABLE "opening" RENAME TO "exits"`);
  }
}
