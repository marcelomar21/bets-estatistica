/**
 * Verifica se os suspeitos estão no banco
 */
require('dotenv').config();
const { supabase } = require('../lib/supabase');

const SUSPEITOS = [
  'Danilo Souza Santos',
  'Jaqueline Alves',
  'Kamila Rodrigues padilha',
  'Camila Oliveira'
];

async function run() {
  // Buscar TODOS os membros do banco (incluindo removidos)
  const { data: allMembers, error } = await supabase
    .from('members')
    .select('id, telegram_id, telegram_username, email, status, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log('══════════════════════════════════════════════════════════════');
  console.log('           TODOS OS MEMBROS NO BANCO (qualquer status)');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log(`Total no banco: ${allMembers.length}\n`);

  // Mostrar todos
  allMembers.forEach((m, i) => {
    const username = m.telegram_username ? '@' + m.telegram_username : '(sem @)';
    const email = m.email || '(sem email)';
    console.log(`${(i+1).toString().padStart(2)}. ${username.padEnd(22)} | ${m.status.padEnd(12)} | ${email}`);
  });

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                    BUSCA POR SUSPEITOS');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Buscar por nome parcial nos emails e usernames
  for (const suspeito of SUSPEITOS) {
    console.log(`🔍 Buscando: "${suspeito}"`);

    const partes = suspeito.toLowerCase().split(' ');

    // Procura match parcial em username ou email
    const matches = allMembers.filter(m => {
      const username = (m.telegram_username || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      return partes.some(parte =>
        username.includes(parte) || email.includes(parte)
      );
    });

    if (matches.length > 0) {
      console.log(`   ✅ POSSÍVEL MATCH:`);
      matches.forEach(m => {
        console.log(`      └─ @${m.telegram_username || '(sem)'} | ${m.email || '(sem)'} | ${m.status}`);
      });
    } else {
      console.log(`   ❌ NÃO ENCONTRADO no banco`);
    }
    console.log('');
  }

  // Stats por status
  console.log('══════════════════════════════════════════════════════════════');
  console.log('                       ESTATÍSTICAS');
  console.log('══════════════════════════════════════════════════════════════\n');

  const stats = {
    trial: allMembers.filter(m => m.status === 'trial').length,
    ativo: allMembers.filter(m => m.status === 'ativo').length,
    inadimplente: allMembers.filter(m => m.status === 'inadimplente').length,
    removido: allMembers.filter(m => m.status === 'removido').length,
  };

  console.log(`   trial:        ${stats.trial}`);
  console.log(`   ativo:        ${stats.ativo}`);
  console.log(`   inadimplente: ${stats.inadimplente}`);
  console.log(`   removido:     ${stats.removido}`);
  console.log(`   ─────────────────`);
  console.log(`   TOTAL:        ${allMembers.length}`);
}

run();
