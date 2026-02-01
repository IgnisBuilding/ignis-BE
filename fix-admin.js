const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.tefkynezhgqixlqjrftn:Irtiza1%40fast@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function fixAdmin() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check if admin exists
    const admin = await client.query(`
      SELECT id, email, password, name, role, is_active FROM users WHERE email = 'admin@ignis.com'
    `);

    console.log('Admin user:', admin.rows[0] || 'NOT FOUND');

    // Generate proper hash for admin123
    const password = 'admin123';
    const hash = await bcrypt.hash(password, 10);

    if (admin.rows.length === 0) {
      // Create admin user
      const result = await client.query(`
        INSERT INTO users (email, password, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, 'Admin', 'building_authority', true, NOW(), NOW())
        RETURNING id, email, name, role
      `, ['admin@ignis.com', hash]);
      console.log('\nCreated admin user:', result.rows[0]);
    } else {
      // Update password
      await client.query(`
        UPDATE users SET password = $1, is_active = true WHERE email = 'admin@ignis.com'
      `, [hash]);
      console.log('\nUpdated admin password');
    }

    // Verify
    const verify = await client.query(`SELECT id, email, name, role, is_active FROM users WHERE email = 'admin@ignis.com'`);
    console.log('\nAdmin after fix:', verify.rows[0]);

    // Test password
    const testUser = await client.query(`SELECT password FROM users WHERE email = 'admin@ignis.com'`);
    const isValid = await bcrypt.compare('admin123', testUser.rows[0].password);
    console.log('Password "admin123" valid:', isValid);

    console.log('\n=== Done ===');
    console.log('Login with: admin@ignis.com / admin123');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

fixAdmin();
