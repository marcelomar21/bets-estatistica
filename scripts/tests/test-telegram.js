/**
 * Test Telegram bot connection and message sending
 * Run: node scripts/test-telegram.js
 */
const { testConnection, sendToAdmin, sendToPublic } = require('../bot/telegram');

async function main() {
  console.log('Testing Telegram bot...\n');

  // Test 1: Bot connection
  console.log('1. Testing bot connection...');
  const connResult = await testConnection();
  
  if (!connResult.success) {
    console.log('❌ Bot connection failed:', connResult.error.message);
    process.exit(1);
  }
  console.log(`✅ Bot connected: @${connResult.data.username}\n`);

  // Test 2: Send to admin group
  console.log('2. Sending test message to admin group...');
  const adminResult = await sendToAdmin('🔧 *Teste do Bot*\n\nEsta é uma mensagem de teste do sistema.');
  
  if (!adminResult.success) {
    console.log('❌ Failed to send to admin:', adminResult.error.message);
    console.log('   Verifique se o bot foi adicionado ao grupo admin');
  } else {
    console.log(`✅ Admin message sent (ID: ${adminResult.data.messageId})\n`);
  }

  // Test 3: Send to public group
  console.log('3. Sending test message to public group...');
  const publicResult = await sendToPublic('🎯 *Teste do Bot*\n\nO bot está funcionando! 🚀');
  
  if (!publicResult.success) {
    console.log('❌ Failed to send to public:', publicResult.error.message);
    console.log('   Verifique se o bot foi adicionado ao grupo público');
  } else {
    console.log(`✅ Public message sent (ID: ${publicResult.data.messageId})\n`);
  }

  // Summary
  console.log('='.repeat(40));
  if (connResult.success && adminResult.success && publicResult.success) {
    console.log('✅ Todos os testes passaram!');
  } else {
    console.log('⚠️  Alguns testes falharam - verifique acima');
  }
}

main();
