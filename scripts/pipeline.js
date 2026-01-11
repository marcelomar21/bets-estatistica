#!/usr/bin/env node
/**
 * Pipeline Unificado - bets-estatistica
 * 
 * Executa todo o fluxo de ETL + Análise em um único comando.
 * 
 * Usage:
 *   node scripts/pipeline.js              # Roda todo o pipeline
 *   node scripts/pipeline.js --step=X     # Roda apenas step X
 *   node scripts/pipeline.js --from=X     # Roda a partir do step X
 *   node scripts/pipeline.js --help       # Mostra ajuda
 * 
 * Steps:
 *   1. check-queue   - Verifica jogos que precisam de análise
 *   2. daily-update  - Busca dados da API FootyStats
 *   3. run-analysis  - Roda análise IA (LangChain)
 *   4. save-outputs  - Salva análises no banco
 *   5. enrich-odds   - Enriquece com odds (The Odds API)
 *   6. request-links - Pede links no grupo admin (se bot ativo)
 */
require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const STEPS = [
  {
    id: 1,
    name: 'sync-seasons',
    description: 'Sincroniza temporadas e jogos da API FootyStats',
    script: 'scripts/syncSeasons.js',
    args: [],
    optional: false,
    requiresApiKey: true,
  },
  {
    id: 2,
    name: 'check-queue',
    description: 'Verifica jogos que precisam de análise',
    script: 'scripts/check_analysis_queue.js',
    args: [],
    optional: false,
  },
  {
    id: 3,
    name: 'daily-update',
    description: 'Busca detalhes e stats da API FootyStats',
    script: 'scripts/daily_update.js',
    args: [],
    optional: false,
    requiresApiKey: true,
  },
  {
    id: 4,
    name: 'run-analysis',
    description: 'Roda análise IA (LangChain + OpenAI)',
    script: 'agent/analysis/runAnalysis.js',
    args: ['today'],
    optional: false,
    requiresOpenAI: true,
  },
  {
    id: 5,
    name: 'save-outputs',
    description: 'Salva análises e apostas no banco',
    script: 'agent/persistence/main.js',
    args: [],
    optional: false,
  },
  {
    id: 6,
    name: 'enrich-odds',
    description: 'Enriquece apostas com odds (The Odds API)',
    script: 'bot/jobs/enrichOdds.js',
    args: [],
    optional: true,
  },
  {
    id: 7,
    name: 'request-links',
    description: 'Pede links no grupo admin do Telegram',
    script: 'bot/jobs/requestLinks.js',
    args: [],
    optional: true,
  },
  {
    id: 8,
    name: 'post-bets',
    description: 'Publica apostas no grupo público do Telegram',
    script: 'bot/jobs/postBets.js',
    args: [],
    optional: true,
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    step: null,
    from: null,
    help: false,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg.startsWith('--step=')) {
      options.step = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--from=')) {
      options.from = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
🚀 Pipeline Unificado - bets-estatistica

Usage:
  node scripts/pipeline.js              # Roda todo o pipeline
  node scripts/pipeline.js --step=3     # Roda apenas step 3 (run-analysis)
  node scripts/pipeline.js --from=3     # Roda a partir do step 3
  node scripts/pipeline.js --dry-run    # Mostra o que seria executado
  node scripts/pipeline.js --help       # Mostra esta ajuda

Steps disponíveis:
${STEPS.map(s => `  ${s.id}. ${s.name.padEnd(15)} - ${s.description}${s.optional ? ' (opcional)' : ''}`).join('\n')}

Variáveis de ambiente necessárias:
  - SUPABASE_URL, SUPABASE_SERVICE_KEY, DATABASE_URL (banco)
  - api_key ou API_KEY (FootyStats)
  - OPENAI_API_KEY (análise IA)
  - THE_ODDS_API_KEY (odds)
  - TELEGRAM_BOT_TOKEN (bot)
`);
}

function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(REPO_ROOT, scriptPath);
    console.log(`\n📍 Executando: node ${scriptPath} ${args.join(' ')}`);
    console.log('─'.repeat(60));

    const child = spawn(process.execPath, [fullPath, ...args], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptPath} saiu com código ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function checkRequirements(step) {
  const missing = [];

  if (step.requiresApiKey && !process.env.FOOTYSTATS_API_KEY && !process.env.api_key && !process.env.API_KEY) {
    missing.push('FOOTYSTATS_API_KEY (FootyStats)');
  }

  if (step.requiresOpenAI && !process.env.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }

  return missing;
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  console.log('🚀 Pipeline bets-estatistica\n');
  console.log('═'.repeat(60));

  // Determine which steps to run
  let stepsToRun = STEPS;

  if (options.step !== null) {
    const step = STEPS.find(s => s.id === options.step);
    if (!step) {
      console.error(`❌ Step ${options.step} não encontrado`);
      process.exit(1);
    }
    stepsToRun = [step];
  } else if (options.from !== null) {
    stepsToRun = STEPS.filter(s => s.id >= options.from);
  }

  // Filter out optional steps if running full pipeline
  if (options.step === null && options.from === null) {
    stepsToRun = stepsToRun.filter(s => !s.optional);
  }

  console.log(`📋 Steps a executar: ${stepsToRun.map(s => s.name).join(' → ')}\n`);

  if (options.dryRun) {
    console.log('🔍 [DRY RUN] Mostrando o que seria executado:\n');
    for (const step of stepsToRun) {
      console.log(`  ${step.id}. ${step.name}: node ${step.script} ${step.args.join(' ')}`);
    }
    return;
  }

  // Run each step
  for (const step of stepsToRun) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📦 Step ${step.id}: ${step.name}`);
    console.log(`   ${step.description}`);

    // Check requirements
    const missing = checkRequirements(step);
    if (missing.length > 0) {
      console.log(`\n⚠️  Pulando: variáveis faltando: ${missing.join(', ')}`);
      continue;
    }

    try {
      await runScript(step.script, step.args);
      console.log(`\n✅ Step ${step.id} concluído`);
    } catch (err) {
      console.error(`\n❌ Step ${step.id} falhou: ${err.message}`);
      
      // Don't fail the whole pipeline for optional steps
      if (step.optional) {
        console.log('   (step opcional, continuando...)');
        continue;
      }
      
      process.exit(1);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('🎉 Pipeline concluído com sucesso!');
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('❌ Pipeline falhou:', err.message);
  process.exit(1);
});
