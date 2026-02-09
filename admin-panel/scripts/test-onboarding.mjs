import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://vqrcuttvcgmozabsqqja.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcmN1dHR2Y2dtb3phYnNxcWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDE2NzcsImV4cCI6MjA4NTM3NzY3N30.fdgOdp9NxCHUTs5aY_nH4TvpBSz-sjxB4ieVd4zHRd4';

const BASE = 'http://localhost:3000';

async function main() {
  // 1. Get auth token
  const supabase = createClient(SUPA_URL, ANON_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'super@admin.test',
    password: 'Admin123!',
  });
  if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
  console.log('✅ Authenticated');

  // Supabase SSR reads cookies in the format: sb-<ref>-auth-token
  const cookieValue = `base64-${Buffer.from(JSON.stringify({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    token_type: 'bearer',
    expires_in: auth.session.expires_in,
    expires_at: auth.session.expires_at,
  })).toString('base64')}`;

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `sb-vqrcuttvcgmozabsqqja-auth-token=${cookieValue}`,
  };

  // Check bots
  const botsRes = await fetch(`${BASE}/api/bots`, { headers });
  const botsBody = await botsRes.json();
  if (!botsBody.success) { console.error('❌ Failed to get bots:', botsBody.error); process.exit(1); }
  const bot = botsBody.data?.find(b => b.status === 'available');
  if (!bot) { console.error('❌ No available bot. Bots:', botsBody.data); process.exit(1); }
  console.log(`✅ Bot found: ${bot.bot_username} (${bot.id})`);

  async function callStep(name, body) {
    console.log(`\n--- ${name} ---`);
    const res = await fetch(`${BASE}/api/groups/onboarding`, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
    return { status: res.status, ...data };
  }

  // Step 1: Creating
  const s1 = await callStep('Step 1: Creating group', {
    step: 'creating', name: 'Osmar Palpites', email: 'osmar-test@example.com', bot_id: bot.id, price: 49.90,
  });
  if (!s1.success) { console.error('❌ Step 1 failed'); process.exit(1); }
  const group_id = s1.data.group_id;

  // Step 2: Validating bot
  const s2 = await callStep('Step 2: Validating bot', { step: 'validating_bot', group_id });
  if (!s2.success) { console.error('❌ Step 2 failed'); process.exit(1); }

  // Step 3: Configuring Mercado Pago
  const s3 = await callStep('Step 3: Configuring MP', { step: 'configuring_mp', group_id, price: 49.90 });
  if (!s3.success) { console.error('❌ Step 3 failed'); process.exit(1); }

  // Step 4: Deploying bot (may fail in dev — no Render)
  const s4 = await callStep('Step 4: Deploying bot', { step: 'deploying_bot', group_id });
  if (!s4.success) { console.log('⚠️  Step 4 failed (expected in dev if no RENDER_API_KEY)'); }

  // Step 5: Creating admin
  const s5 = await callStep('Step 5: Creating admin', { step: 'creating_admin', group_id, email: 'osmar-test@example.com' });
  if (!s5.success) { console.log('⚠️  Step 5 result:', s5.error?.message); }

  // Step 6: Creating telegram group (needs MTProto session)
  const s6 = await callStep('Step 6: Creating Telegram group', { step: 'creating_telegram_group', group_id });
  if (!s6.success) { console.log('⚠️  Step 6 result:', s6.error?.message); }

  console.log('\n========================================');
  console.log('Group ID:', group_id);
  console.log('MP passed:', s3.success ? '✅ YES' : '❌ NO');
  console.log('========================================');
}

main().catch(console.error);
