import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignApartmentToResident1800000000036 implements MigrationInterface {
  name = 'AssignApartmentToResident1800000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find the first available apartment
    const apartments = await queryRunner.query(
      `SELECT id FROM apartment ORDER BY id ASC LIMIT 1`,
    );

    if (apartments.length === 0) {
      console.warn('No apartments found in database — skipping resident apartment assignment');
      return;
    }

    const apartmentId = apartments[0].id;

    // Get the resident user's id
    const users = await queryRunner.query(
      `SELECT id FROM "users" WHERE email = 'resident@ignis.com'`,
    );

    if (users.length === 0) {
      console.warn('resident@ignis.com not found — skipping apartment assignment');
      return;
    }

    const userId = users[0].id;

    // Assign the apartment to the resident user via apartment.owner_id
    await queryRunner.query(
      `UPDATE apartment SET owner_id = $1, occupied = true, updated_at = NOW() WHERE id = $2`,
      [userId, apartmentId],
    );

    // Also set users.apartment_id for backward compat (will be dropped in later migration)
    await queryRunner.query(
      `UPDATE "users" SET apartment_id = $1, updated_at = NOW() WHERE id = $2`,
      [apartmentId, userId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Get the apartment that was assigned
    const user = await queryRunner.query(
      `SELECT apartment_id FROM "users" WHERE email = 'resident@ignis.com'`,
    );

    if (user.length > 0 && user[0].apartment_id) {
      await queryRunner.query(
        `UPDATE apartment SET occupied = false, updated_at = NOW() WHERE id = $1`,
        [user[0].apartment_id],
      );
    }

    // Remove apartment assignment
    await queryRunner.query(
      `UPDATE "users" SET apartment_id = NULL, updated_at = NOW() WHERE email = 'resident@ignis.com'`,
    );
  }
}
