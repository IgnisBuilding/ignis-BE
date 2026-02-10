import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class SeedFirefighterRolesAndEmployees1800000000042 implements MigrationInterface {
  name = 'SeedFirefighterRolesAndEmployees1800000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const firefighterPassword = await bcrypt.hash('firefighter123', 10);

    // 1. Update existing firefighter user to firefighter_district role
    await queryRunner.query(`
      UPDATE "users" SET role = 'firefighter_district', name = 'District Firefighter', updated_at = NOW()
      WHERE email = 'firefighter@ignis.com'
    `);

    // 2. Create HQ firefighter user
    await queryRunner.query(`
      INSERT INTO "users" (email, password, name, role, is_active, created_at, updated_at)
      VALUES ('firefighter_hq@ignis.com', $1, 'HQ Commander', 'firefighter_hq', true, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [firefighterPassword]);

    // 3. Create State firefighter user
    await queryRunner.query(`
      INSERT INTO "users" (email, password, name, role, is_active, created_at, updated_at)
      VALUES ('firefighter_state@ignis.com', $1, 'State Firefighter', 'firefighter_state', true, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `, [firefighterPassword]);

    // 4. Get user IDs
    const hqUser = await queryRunner.query(`SELECT id FROM "users" WHERE email = 'firefighter_hq@ignis.com'`);
    const stateUser = await queryRunner.query(`SELECT id FROM "users" WHERE email = 'firefighter_state@ignis.com'`);
    const districtUser = await queryRunner.query(`SELECT id FROM "users" WHERE email = 'firefighter@ignis.com'`);

    // 5. Create employee records linking users to fire brigade hierarchy
    // HQ employee — linked to HQ (id=1)
    if (hqUser.length > 0) {
      await queryRunner.query(`
        INSERT INTO "employee" (user_id, hq_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
        VALUES ($1, 1, 'HQ Commander', 'Commander', 'HQ-001', 'active', '2020-01-15', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [hqUser[0].id]);
    }

    // State employee — linked to State (id=1)
    if (stateUser.length > 0) {
      await queryRunner.query(`
        INSERT INTO "employee" (user_id, state_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
        VALUES ($1, 1, 'State Officer', 'Captain', 'ST-001', 'active', '2021-03-10', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [stateUser[0].id]);
    }

    // District employee — linked to Brigade (id=1)
    if (districtUser.length > 0) {
      await queryRunner.query(`
        INSERT INTO "employee" (user_id, brigade_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
        VALUES ($1, 1, 'Station Officer', 'Lieutenant', 'BR-001', 'active', '2022-06-01', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [districtUser[0].id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove employee records
    await queryRunner.query(`
      DELETE FROM "employee" WHERE user_id IN (
        SELECT id FROM "users" WHERE email IN ('firefighter_hq@ignis.com', 'firefighter_state@ignis.com', 'firefighter@ignis.com')
      )
    `);

    // Remove new users
    await queryRunner.query(`DELETE FROM "users" WHERE email IN ('firefighter_hq@ignis.com', 'firefighter_state@ignis.com')`);

    // Revert existing firefighter back to original role
    await queryRunner.query(`
      UPDATE "users" SET role = 'firefighter', name = 'Fire Fighter', updated_at = NOW()
      WHERE email = 'firefighter@ignis.com'
    `);
  }
}
