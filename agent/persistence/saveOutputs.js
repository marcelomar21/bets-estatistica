const path = require('path');
const fs = require('fs-extra');

const { generateMarkdown } = require('./generateMarkdown');
const { getPool } = require('../db');

const INTERMEDIATE_DIR = path.join(__dirname, '../../data/analises_intermediarias');
const FINAL_DIR = path.join(__dirname, '../../data/analises_finais');

const slugify = (value) => {
  if (!value) return 'na';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
};

const formatDateSlug = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return 'data';
  }
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

const normalizeOdds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const collectBets = (output) => {
  if (!output) return [];
  const safe = (output.apostas_seguras || []).map((bet) => ({ ...bet, category: 'SAFE' }));
  const opportunities = (output.oportunidades || []).map((bet) => ({
    ...bet,
    category: 'OPORTUNIDADE',
  }));
  return [...safe, ...opportunities];
};

const getIntermediatePath = (matchId) => path.join(INTERMEDIATE_DIR, `${matchId}.json`);

const deriveFinalPath = (payload) => {
  const match = payload.context?.match_row || {};
  const competition = slugify(match.competition_name || match.league_name || 'competicao');
  const fixture = `${slugify(match.home_team_name || 'casa')}vs${slugify(match.away_team_name || 'fora')}`;
  const date = formatDateSlug(match.kickoff_time);
  return path.join(FINAL_DIR, `${competition}_${fixture}_${date}.md`);
};

const persistInDatabase = async (matchId, markdown, payload, bets) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO game_analysis (match_id, analysis_md, analysis_json, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (match_id) DO UPDATE
          SET analysis_md = EXCLUDED.analysis_md,
              analysis_json = EXCLUDED.analysis_json,
              updated_at = NOW();
      `,
      [matchId, markdown, JSON.stringify(payload)],
    );

    await client.query('DELETE FROM suggested_bets WHERE match_id = $1', [matchId]);
    for (const bet of bets) {
      await client.query(
        `
          INSERT INTO suggested_bets
            (match_id, bet_market, bet_pick, odds, confidence, reasoning, risk_level, bet_category)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
          matchId,
          bet.mercado,
          bet.pick,
          normalizeOdds(bet.odds),
          typeof bet.confianca === 'number' ? bet.confianca : null,
          bet.justificativa,
          bet.risco,
          bet.category,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const saveOutputs = async (matchId) => {
  const filePath = getIntermediatePath(matchId);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    throw new Error(`Arquivo intermediário não encontrado: ${filePath}`);
  }

  const payload = await fs.readJson(filePath);
  const markdown = generateMarkdown(payload);
  await fs.ensureDir(FINAL_DIR);
  const finalPath = deriveFinalPath(payload);
  await fs.writeFile(finalPath, markdown, 'utf8');

  const bets = collectBets(payload.output);
  await persistInDatabase(matchId, markdown, payload, bets);

  return {
    finalPath,
    betsPersisted: bets.length,
  };
};

module.exports = {
  saveOutputs,
};


