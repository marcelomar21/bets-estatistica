#!/usr/bin/env node

/**
 * Gera PDFs de análise para os próximos jogos de times específicos.
 *
 * Uso:
 *   node scripts/generateTeamPdfs.js                  # Todos os 6 times alvo
 *   node scripts/generateTeamPdfs.js Flamengo Vasco   # Só times especificados
 */
require('dotenv').config();

const fs = require('fs-extra');
const { getPool, closePool } = require('./lib/db');
const { renderHtmlReport } = require('../agent/persistence/htmlRenderer');
const { generatePdfFromHtml } = require('../agent/persistence/reportService');
const { resolveReportPaths, ensureDirectory, REPORTS_HTML_DIR, REPORTS_PDF_DIR } = require('../agent/persistence/reportUtils');

const TARGET_TEAMS = {
  'Flamengo':     '%Flamengo%',
  'Vasco':        '%Vasco%',
  'Botafogo':     '%Botafogo%',
  'Fluminense':   '%Fluminense%',
  'Athletico PR': '%Atl%tico PR%',
  'Coritiba':     '%Coritiba%',
};

const QUERY = `
  SELECT lm.match_id, lm.home_team_name, lm.away_team_name,
         lm.kickoff_time, lm.status, lm.venue,
         ls.league_name, ls.country,
         ga.analysis_json
  FROM league_matches lm
  JOIN league_seasons ls ON lm.season_id = ls.season_id
  JOIN game_analysis ga ON lm.match_id = ga.match_id
  WHERE (lm.home_team_name ILIKE $1 OR lm.away_team_name ILIKE $1)
    AND lm.kickoff_time >= NOW()
  ORDER BY lm.kickoff_time ASC
  LIMIT 1
`;

function filterTeams(args) {
  if (!args.length) return TARGET_TEAMS;

  const filtered = {};
  for (const arg of args) {
    const key = Object.keys(TARGET_TEAMS).find(
      (k) => k.toLowerCase().includes(arg.toLowerCase())
    );
    if (key) {
      filtered[key] = TARGET_TEAMS[key];
    } else {
      console.warn(`[generateTeamPdfs] Time "${arg}" não encontrado no mapa de times alvo. Pulando.`);
    }
  }
  return filtered;
}

async function generateForTeam(pool, teamName, pattern) {
  const { rows } = await pool.query(QUERY, [pattern]);

  if (!rows.length) {
    console.warn(`[generateTeamPdfs] ${teamName}: nenhum jogo futuro com análise encontrado. Pulando.`);
    return null;
  }

  const row = rows[0];
  const payload = row.analysis_json;

  if (!payload || !payload.output) {
    console.warn(`[generateTeamPdfs] ${teamName}: analysis_json inválido para match_id ${row.match_id}. Pulando.`);
    return null;
  }

  // Garantir que context.match_row tenha os dados necessários para naming e HTML
  if (!payload.context) payload.context = {};
  if (!payload.context.match_row) {
    payload.context.match_row = {
      home_team_name: row.home_team_name,
      away_team_name: row.away_team_name,
      kickoff_time: row.kickoff_time,
      competition_name: row.league_name,
      league_name: row.league_name,
      country: row.country,
      venue: row.venue,
    };
  }

  // Garantir match_id no payload para validação
  if (!payload.match_id) payload.match_id = row.match_id;

  const html = renderHtmlReport(payload);
  const { htmlPath, pdfPath } = resolveReportPaths(payload);

  await fs.writeFile(htmlPath, html, 'utf8');

  const pdfBuffer = await generatePdfFromHtml(html);
  await fs.writeFile(pdfPath, pdfBuffer);

  return {
    team: teamName,
    matchId: row.match_id,
    match: `${row.home_team_name} x ${row.away_team_name}`,
    kickoff: row.kickoff_time,
    league: row.league_name,
    htmlPath,
    pdfPath,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const teams = filterTeams(args);
  const teamEntries = Object.entries(teams);

  if (!teamEntries.length) {
    console.error('[generateTeamPdfs] Nenhum time válido para processar.');
    process.exit(1);
  }

  console.log(`[generateTeamPdfs] Gerando PDFs para ${teamEntries.length} time(s)...`);

  await ensureDirectory(REPORTS_HTML_DIR);
  await ensureDirectory(REPORTS_PDF_DIR);

  const pool = getPool();
  const results = [];
  const failures = [];

  try {
    for (const [teamName, pattern] of teamEntries) {
      try {
        const result = await generateForTeam(pool, teamName, pattern);
        if (result) results.push(result);
      } catch (err) {
        console.error(`[generateTeamPdfs] Erro ao processar ${teamName}: ${err.message}`);
        failures.push({ team: teamName, error: err.message });
      }
    }
  } finally {
    await closePool();
  }

  // Resumo
  console.log('\n=== RESUMO ===');
  if (results.length > 0) {
    for (const r of results) {
      console.log(`\n${r.team}: ${r.match}`);
      console.log(`  Liga: ${r.league}`);
      console.log(`  Kickoff: ${r.kickoff}`);
      console.log(`  PDF: ${r.pdfPath}`);
    }
    console.log(`\nTotal: ${results.length} PDF(s) gerado(s).`);
  } else {
    console.log('Nenhum PDF gerado.');
  }

  if (failures.length > 0) {
    console.error(`\n=== ERROS (${failures.length}) ===`);
    for (const f of failures) {
      console.error(`  ${f.team}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[generateTeamPdfs] Erro fatal:', err.message);
  process.exitCode = 1;
});
