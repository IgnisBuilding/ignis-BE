const { Client } = require('pg');

async function testOhioConnection() {
  const client = new Client({
    host: 'aws-0-us-east-2.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres',
    password: 'IgnisFast123',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully to Ohio region!');
    const result = await client.query('SELECT NOW()');
    console.log('✅ Query result:', result.rows[0]);
    await client.end();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testOhioConnection();