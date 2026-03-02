const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function debugAuth() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get both users and compare
    const users = await client.query(`
      SELECT id, email, password, name, role, is_active
      FROM users
      WHERE email IN ('firefighter@ignis.com', 'firefighter.district@ignis.com')
    `);

    console.log('=== Comparing Users ===\n');

    users.rows.forEach(u => {
      console.log(`Email: ${u.email}`);
      console.log(`  ID: ${u.id}`);
      console.log(`  Name: ${u.name}`);
      console.log(`  Role: ${u.role}`);
      console.log(`  Is Active: ${u.is_active}`);
      console.log(`  Password Hash: ${u.password}`);
      console.log(`  Hash Length: ${u.password?.length}`);
      console.log('');
    });

    // Check if hashes are identical
    if (users.rows.length === 2) {
      const hash1 = users.rows[0].password;
      const hash2 = users.rows[1].password;
      console.log('Password hashes identical:', hash1 === hash2);
    }

    // Check employee records
    console.log('\n=== Employee Records ===');
    const employees = await client.query(`
      SELECT e.*, u.email
      FROM employee e
      JOIN users u ON e.user_id = u.id
      WHERE u.email IN ('firefighter@ignis.com', 'firefighter.district@ignis.com')
    `);
    console.table(employees.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

debugAuth();
