import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class FixUserPasswords1800000000035 implements MigrationInterface {
  name = 'FixUserPasswords1800000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix resident password to 'resident123' (was incorrectly set to 'admin123')
    const residentPassword = await bcrypt.hash('resident123', 10);
    await queryRunner.query(
      `UPDATE "users" SET password = $1, updated_at = NOW() WHERE email = 'resident@ignis.com'`,
      [residentPassword],
    );

    // Fix firefighter password to 'firefighter123' (was incorrectly set to 'admin123')
    const firefighterPassword = await bcrypt.hash('firefighter123', 10);
    await queryRunner.query(
      `UPDATE "users" SET password = $1, updated_at = NOW() WHERE email = 'firefighter@ignis.com'`,
      [firefighterPassword],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert both to 'admin123'
    const adminPassword = await bcrypt.hash('admin123', 10);
    await queryRunner.query(
      `UPDATE "users" SET password = $1, updated_at = NOW() WHERE email IN ('resident@ignis.com', 'firefighter@ignis.com')`,
      [adminPassword],
    );
  }
}
