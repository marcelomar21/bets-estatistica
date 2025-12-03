const { getPool } = require('../db');
const { loadAnalysisPayload } = require('./reportUtils');
const { extractSections } = require('./analysisParser');
const { markAnalysisStatus } = require('../../scripts/lib/matchScreening');

const normalizeOdds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeBetEntry = (bet, category, index) => {
  if (!bet) return null;
  const title =
    (bet.mercado ||
      bet.titulo ||
      bet.title ||
      bet.pick ||
      bet.descricao ||
      bet.description ||
      `Entrada ${index + 1}`) ?? `Entrada ${index + 1}`;
  const cleanedTitle = String(title).trim() || `Entrada ${index + 1}`;
  const reasoning =
    bet.justificativa ||
    bet.reasoning ||
    bet.descricao ||
    bet.description ||
    bet.content ||
    '';
  const cleanedReasoning = String(reasoning).trim() || 'Sem justificativa disponível.';
  const odds = bet.odds ?? bet.valor ?? bet.price ?? null;
  const confidence =
    typeof bet.confianca === 'number'
      ? bet.confianca
      : typeof bet.confidence === 'number'
        ? bet.confidence
        : null;
  const riskLevel = bet.risco || bet.risk_level || (category === 'SAFE' ? 'Saldo' : 'Agres');

  return {
    mercado: bet.mercado || cleanedTitle,
    pick: bet.pick || cleanedTitle,
    justificativa: cleanedReasoning,
    odds,
    confianca: confidence,
    risco: riskLevel,
    category,
  };
};

const collectBets = (output) => {
  if (!output) return [];
  const safe =
    output.apostas_seguras?.map((bet, index) => normalizeBetEntry(bet, 'SAFE', index)) || [];
  const opportunities =
    output.oportunidades?.map((bet, index) => normalizeBetEntry(bet, 'OPORTUNIDADE', index)) ||
    [];
  return [...safe, ...opportunities].filter(Boolean);
};

const persistInDatabase = async (matchId, payload, bets, analysisText) => {
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
      [matchId, analysisText, JSON.stringify(payload)],
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
  const { payload } = await loadAnalysisPayload(matchId);
  const analysisText =
    payload.output?.analise_texto?.trim() || '# Análise não disponível\nSem conteúdo textual.';
  let bets = collectBets(payload.output);

  let usedFallback = false;
  if (bets.length === 0) {
    const { safe, opportunities } = extractSections(analysisText);
    const fallbackSafe = safe.map((item) => ({
      mercado: item.title,
      pick: item.title,
      justificativa: item.reasoning,
      confianca: null,
      risco: 'Saldo',
      category: 'SAFE',
    }));
    const fallbackOpp = opportunities.map((item) => ({
      mercado: item.title,
      pick: item.title,
      justificativa: item.reasoning,
      confianca: null,
      risco: 'Agres',
      category: 'OPORTUNIDADE',
    }));
    bets = [...fallbackSafe, ...fallbackOpp];
    usedFallback = bets.length > 0;
  }

  await persistInDatabase(matchId, payload, bets, analysisText);
  const generatedAt = payload.generated_at ? new Date(payload.generated_at) : new Date();
  await markAnalysisStatus(getPool(), matchId, 'complete', {
    analysisGeneratedAt: generatedAt,
    clearErrorReason: true,
  });

  return {
    betsPersisted: bets.length,
    usedFallback,
  };
};

module.exports = {
  saveOutputs,
};


