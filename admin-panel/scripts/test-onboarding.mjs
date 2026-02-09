import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load env vars from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
    .filter(parts => parts.length >= 2)
    .map(([key, ...vals]) => [key.trim(), vals.join('=').trim()]),
);

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.BASE_URL || 'http://localhost:3000';

if (!SUPA_URL || !ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

// Pass email/password as CLI args or env vars
const EMAIL = process.env.TEST_EMAIL || 'super@admin.test';
const PASSWORD = process.env.TEST_PASSWORD;
if (!PASSWORD) {
  console.error('Set TEST_PASSWORD env var. Usage: TEST_PASSWORD=xxx node scripts/test-onboarding.mjs');
  process.exit(1);
}

// Extract Supabase ref from URL for cookie name
const supaRef = new URL(SUPA_URL).hostname.split('.')[0];

async function main() {
  // 1. Get auth token
  const supabase = createClient(SUPA_URL, ANON_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
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
    'Cookie': `sb-${supaRef}-auth-token=${cookieValue}`,
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
