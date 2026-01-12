/**
 * Test Supabase connection
 * Run: node scripts/test-supabase.js
 */
const { testConnection } = require('../lib/supabase');

async function main() {
  console.log('Testing Supabase connection...\n');
  
  const result = await testConnection();
  
  if (result.success) {
    console.log('✅ Supabase connection successful!');
    process.exit(0);
  } else {
    console.log('❌ Supabase connection failed:', result.error.message);
    process.exit(1);
  }
}

main();
