import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAdminUserRole1800000000041 implements MigrationInterface {
  name = 'FixAdminUserRole1800000000041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update admin@ignis.com from building_authority to admin (super admin)
    await queryRunner.query(`
      UPDATE "users"
      SET role = 'admin', name = 'Super Admin'
      WHERE email = 'admin@ignis.com'
    `);

    // Ensure management@ignis.com has management role (building manager)
    await queryRunner.query(`
      UPDATE "users"
      SET role = 'management', name = 'Building Manager'
      WHERE email = 'management@ignis.com'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET role = 'building_authority', name = 'Admin User'
      WHERE email = 'admin@ignis.com'
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET role = 'management', name = 'Admin User'
      WHERE email = 'management@ignis.com'
    `);
  }
}
