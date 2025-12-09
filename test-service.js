const { createClient } = require('@supabase/supabase-js');

async function testSupabaseClient() {
  const supabaseUrl = 'https://bixtnbskchfvsdtpxrxc.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpeHRuYnNrY2hmdnNkdHB4cnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTM0MzAsImV4cCI6MjA3NTgyOTQzMH0.vu4pUxoubWeYfiWUDNXmt6j3ZNEsDJK7jMiWtltIMjk';

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .limit(1);

    if (error) {
      console.error('❌ Supabase client error:', error.message);
    } else {
      console.log('✅ Supabase client connected successfully!');
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

testSupabaseClient();