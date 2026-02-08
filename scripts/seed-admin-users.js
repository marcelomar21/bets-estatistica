/**
 * Seed script: Cria usuários admin de teste no Supabase
 *
 * Uso: node scripts/seed-admin-users.js
 *
 * Requer no .env:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, SEED_ADMIN_PASSWORD
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

const TEST_USERS = [
  {
    email: 'super@admin.test',
    password: SEED_PASSWORD,
    role: 'super_admin',
    group_id: null,
  },
  {
    email: 'group@admin.test',
    password: SEED_PASSWORD,
    role: 'group_admin',
    group_id: null, // será preenchido se existir um grupo
  },
];

async function findFirstGroup() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('⚠️  Nenhum grupo encontrado — group_admin ficará sem grupo associado');
    return null;
  }
  console.log(`✓ Grupo encontrado: ${data.name} (${data.id})`);
  return data.id;
}

async function createUser(userData) {
  const { email, password, role, group_id } = userData;

  // 1. Verificar se já existe no Auth
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === email);

  let userId;

  if (existing) {
    console.log(`⏭️  Auth user já existe: ${email} (${existing.id})`);
    userId = existing.id;
  } else {
    // 2. Criar no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma email automaticamente
    });

    if (authError) {
      console.error(`❌ Erro ao criar auth user ${email}:`, authError.message);
      return;
    }

    userId = authData.user.id;
    console.log(`✓ Auth user criado: ${email} (${userId})`);
  }

  // 3. Upsert na tabela admin_users
  const { error: dbError } = await supabase
    .from('admin_users')
    .upsert({
      id: userId,
      email,
      role,
      group_id,
    }, { onConflict: 'id' });

  if (dbError) {
    console.error(`❌ Erro ao inserir admin_user ${email}:`, dbError.message);
    return;
  }

  console.log(`✓ admin_users: ${email} → ${role}${group_id ? ` (grupo: ${group_id})` : ' (sem grupo)'}`);
}

async function main() {
  console.log('\n🔧 Seed: Criando usuários admin de teste...\n');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !SEED_PASSWORD) {
    console.error('❌ Faltam variáveis no .env: SUPABASE_URL, SUPABASE_SERVICE_KEY e SEED_ADMIN_PASSWORD');
    process.exit(1);
  }

  // Tentar associar group_admin a um grupo existente
  const groupId = await findFirstGroup();
  if (groupId) {
    TEST_USERS[1].group_id = groupId;
  }

  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('\n✅ Seed concluído!\n');
  console.log('Credenciais de teste:');
  console.log('┌─────────────────┬───────────────────┬──────────────────────┐');
  console.log('│ Role            │ Email             │ Senha                │');
  console.log('├─────────────────┼───────────────────┼──────────────────────┤');
  console.log(`│ Super Admin     │ super@admin.test  │ (SEED_ADMIN_PASSWORD)│`);
  console.log(`│ Group Admin     │ group@admin.test  │ (SEED_ADMIN_PASSWORD)│`);
  console.log('└─────────────────┴───────────────────┴──────────────────────┘');
  console.log('\nAgora rode: cd admin-panel && npm run dev');
  console.log('E acesse: http://localhost:3000/login\n');
}

main().catch(console.error);
