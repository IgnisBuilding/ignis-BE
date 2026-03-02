import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class SeedDefaultUsers1800000000030 implements MigrationInterface {
  name = 'SeedDefaultUsers1800000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Hash passwords for each role
    const managementPassword = await bcrypt.hash('admin123', 10);
    const firefighterPassword = await bcrypt.hash('firefighter123', 10);
    const residentPassword = await bcrypt.hash('resident123', 10);

    // Insert default users for each role with their own passwords
    await queryRunner.query(`
      INSERT INTO "users" (email, password, name, role, is_active, created_at, updated_at)
      VALUES
        ('management@ignis.com', $1, 'Admin User', 'management', true, NOW(), NOW()),
        ('firefighter@ignis.com', $2, 'Fire Fighter', 'firefighter', true, NOW(), NOW()),
        ('resident@ignis.com', $3, 'Resident User', 'resident', true, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [managementPassword, firefighterPassword, residentPassword]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "users"
      WHERE email IN ('management@ignis.com', 'firefighter@ignis.com', 'resident@ignis.com')
    `);
  }
}
