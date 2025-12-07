const { Client } = require('pg');

async function testConnection() {
  // Test with service key
  const client = new Client({
    host: 'db.bixtnbskchfvsdtpxrxc.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpeHRuYnNrY2hmdnNkdHB4cnhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDI1MzQzMCwiZXhwIjoyMDc1ODI5NDMwfQ.q7rpLJR_LVke8Z0w1qk5KSniX8v8fCfB129iOW_7i_0',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully with service key!');
    const result = await client.query('SELECT NOW()');
    console.log('✅ Query result:', result.rows[0]);
    await client.end();
  } catch (error) {
    console.error('❌ Connection failed with service key:', error.message);
    
    // Try with pooler and different formats
    console.log('\nTrying pooler connection...');
    // Try both username formats
    const configs = [
      {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres.bixtnbskchfvsdtpxrxc',
        password: 'IgnisFast123',
        ssl: { rejectUnauthorized: false }
      },
      {
        host: 'aws-0-us-east-1.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres',
        password: 'IgnisFast123',
        ssl: { rejectUnauthorized: false }
      }
    ];
    
    for (let i = 0; i < configs.length; i++) {
      console.log(`\nTrying config ${i + 1}: user=${configs[i].user}`);
      const poolerClient = new Client(configs[i]);
      
      try {
        await poolerClient.connect();
        console.log('✅ Connected successfully with pooler!');
        const result = await poolerClient.query('SELECT NOW()');
        console.log('✅ Query result:', result.rows[0]);
        await poolerClient.end();
        return; // Exit on success
      } catch (poolerError) {
        console.error('❌ Pooler connection failed:', poolerError.message);
      }
    }
  }
}

testConnection();