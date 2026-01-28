import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class SeedDefaultUsers1800000000030 implements MigrationInterface {
  name = 'SeedDefaultUsers1800000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Hash password 'admin123' with bcrypt
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Insert default users for each role
    await queryRunner.query(`
      INSERT INTO "users" (email, password, name, role, is_active, created_at, updated_at)
      VALUES
        ('management@ignis.com', $1, 'Admin User', 'management', true, NOW(), NOW()),
        ('firefighter@ignis.com', $1, 'Fire Fighter', 'firefighter', true, NOW(), NOW()),
        ('resident@ignis.com', $1, 'Resident User', 'resident', true, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [hashedPassword]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "users"
      WHERE email IN ('management@ignis.com', 'firefighter@ignis.com', 'resident@ignis.com')
    `);
  }
}
