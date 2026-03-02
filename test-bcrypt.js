const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function testBcrypt() {
  try {
    await client.connect();

    // Get both users
    const users = await client.query(`
      SELECT email, password FROM users
      WHERE email IN ('firefighter@ignis.com', 'firefighter.district@ignis.com')
    `);

    const password = 'firefighter123';

    for (const user of users.rows) {
      console.log(`\nTesting ${user.email}:`);
      console.log(`Hash: ${user.password}`);

      const isValid = await bcrypt.compare(password, user.password);
      console.log(`Password "${password}" valid: ${isValid}`);
    }

    // Also test what hash we get when we hash the password
    console.log('\n--- New Hash ---');
    const newHash = await bcrypt.hash(password, 10);
    console.log('New hash for firefighter123:', newHash);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

testBcrypt();
