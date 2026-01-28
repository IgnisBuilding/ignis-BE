import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedFireBrigadeAndSociety1800000000031 implements MigrationInterface {
  name = 'SeedFireBrigadeAndSociety1800000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert Fire Brigade HQ
    await queryRunner.query(`
      INSERT INTO "fire_brigade_hq" (id, name, address, phone, email, status, created_at, updated_at)
      VALUES (1, 'Karachi Fire Brigade HQ', 'Saddar, Karachi', '021-99999999', 'hq@karachifire.gov.pk', 'active', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `);

    // 2. Insert Fire Brigade State Office
    await queryRunner.query(`
      INSERT INTO "fire_brigade_state" (id, name, state, hq_id, status, address, phone, created_at, updated_at)
      VALUES (1, 'Sindh Fire Service', 'Sindh', 1, 'active', 'Karachi, Sindh', '021-88888888', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `);

    // 3. Insert Fire Brigade (local station)
    await queryRunner.query(`
      INSERT INTO "fire_brigade" (id, name, location, status, state_id, address, phone, email, capacity, created_at, updated_at)
      VALUES (1, 'Model Colony Fire Station', 'Model Colony, Karachi', 'active', 1, 'Model Colony, Malir, Karachi', '021-77777777', 'modelcolony@karachifire.gov.pk', 15, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `);

    // 4. Get the management user ID
    const users = await queryRunner.query(`SELECT id FROM "users" WHERE role = 'management' LIMIT 1`);
    const ownerId = users.length > 0 ? users[0].id : 1;

    // 5. Insert Society
    await queryRunner.query(`
      INSERT INTO "society" (id, name, location, owner_id, brigade_id, created_at, updated_at)
      VALUES (1, 'Model Colony Society', 'Model Colony, Karachi', $1, 1, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        owner_id = EXCLUDED.owner_id,
        updated_at = NOW()
    `, [ownerId]);

    // Reset sequences to avoid ID conflicts
    await queryRunner.query(`SELECT setval('fire_brigade_hq_id_seq', (SELECT COALESCE(MAX(id), 1) FROM fire_brigade_hq))`);
    await queryRunner.query(`SELECT setval('fire_brigade_state_id_seq', (SELECT COALESCE(MAX(id), 1) FROM fire_brigade_state))`);
    await queryRunner.query(`SELECT setval('fire_brigade_id_seq', (SELECT COALESCE(MAX(id), 1) FROM fire_brigade))`);
    await queryRunner.query(`SELECT setval('society_id_seq', (SELECT COALESCE(MAX(id), 1) FROM society))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "society" WHERE id = 1`);
    await queryRunner.query(`DELETE FROM "fire_brigade" WHERE id = 1`);
    await queryRunner.query(`DELETE FROM "fire_brigade_state" WHERE id = 1`);
    await queryRunner.query(`DELETE FROM "fire_brigade_hq" WHERE id = 1`);
  }
}
