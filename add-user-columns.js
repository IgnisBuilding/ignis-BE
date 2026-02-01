const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function addUserColumns() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Add user_id column to fire_brigade_state if not exists
    console.log('Adding user_id to fire_brigade_state...');
    await client.query(`
      ALTER TABLE fire_brigade_state
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
    `);
    console.log('Done.\n');

    // Add user_id column to fire_brigade if not exists
    console.log('Adding user_id to fire_brigade...');
    await client.query(`
      ALTER TABLE fire_brigade
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)
    `);
    console.log('Done.\n');

    console.log('=== All columns added successfully ===');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

addUserColumns();
