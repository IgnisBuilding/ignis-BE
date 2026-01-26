import { MigrationInterface, QueryRunner } from 'typeorm';

export class CleanUpLegacyTables1706300000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check and drop the misspelled 'appartment' table if it exists and is empty
    const appartmentExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'appartment'
      ) as exists
    `);

    if (appartmentExists[0].exists) {
      const appartmentCount = await queryRunner.query('SELECT COUNT(*) as count FROM appartment');

      if (parseInt(appartmentCount[0].count) === 0) {
        await queryRunner.query(`DROP TABLE IF EXISTS public.appartment CASCADE`);
        console.log('Dropped empty legacy table: appartment (misspelled)');
      } else {
        console.log('WARNING: appartment table has data, skipping drop. Manual migration required.');
      }
    }

    // Check and drop the legacy 'sensor' (singular) table if it exists and is empty
    // The 'sensors' (plural) table is the active one
    const sensorExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sensor'
      ) as exists
    `);

    if (sensorExists[0].exists) {
      const sensorCount = await queryRunner.query('SELECT COUNT(*) as count FROM sensor');

      if (parseInt(sensorCount[0].count) === 0) {
        await queryRunner.query(`DROP TABLE IF EXISTS public.sensor CASCADE`);
        console.log('Dropped empty legacy table: sensor (singular, replaced by sensors)');
      } else {
        console.log('WARNING: sensor table has data, skipping drop. Manual migration required.');
      }
    }

    console.log('Schema cleanup completed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the legacy tables if needed for rollback (empty structure only)

    // Recreate appartment table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.appartment (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    console.log('Recreated legacy appartment table (empty structure)');

    // Recreate sensor table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.sensor (
        id SERIAL PRIMARY KEY,
        type INTEGER,
        building_id INTEGER,
        floor_id INTEGER,
        appartment_id INTEGER,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    console.log('Recreated legacy sensor table (empty structure)');
  }
}
