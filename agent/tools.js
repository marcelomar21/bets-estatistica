const { z } = require('zod');
const { runQuery } = require('./db');

let dynamicToolPromise;

const loadToolClass = async () => {
  if (!dynamicToolPromise) {
    dynamicToolPromise = import('@langchain/core/tools').then(
      (mod) => mod.DynamicStructuredTool,
    );
  }
  return dynamicToolPromise;
};

const parseJsonField = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const formatNumber = (value, digits = 2) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(digits);
  }
  return 'n/d';
};

const formatPercent = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toFixed(1)}%`;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return `${parsed.toFixed(1)}%`;
  }
  return 'n/d';
};

const scopeLabel = (scope) => {
  const normalized = typeof scope === 'number' ? scope : Number(scope);
  switch (normalized) {
    case 1:
      return 'recorte como mandante';
    case 2:
      return 'recorte como visitante';
    case 0:
    default:
      return 'recorte geral';
  }
};

const buildLastxSummary = (rawPayload) => {
  const parsed = parseJsonField(rawPayload);
  if (!parsed || typeof parsed !== 'object') return null;
  const dataset = parsed?.data?.data || parsed?.data || parsed;
  const entry = Array.isArray(dataset) ? dataset[0] : dataset;
  if (!entry || typeof entry !== 'object') return null;
  const stats = entry.stats || {};
  const additional = entry.additional_info || {};

  const summary = {
    nome: entry.name_pt || entry.name || entry.full_name || entry.english_name || null,
    escopo: scopeLabel(entry.last_x_home_away_or_overall),
    janela_jogos: entry.last_x_match_num || stats.last_x || null,
    forma_curta:
      additional.formRun_overall ||
      additional.formRun_home ||
      additional.formRun_away ||
      stats.formRun_overall ||
      null,
    recorde: {
      vitorias: stats.seasonWinsNum_overall ?? null,
      empates: stats.seasonDrawsNum_overall ?? null,
      derrotas: stats.seasonLossesNum_overall ?? null,
      pontos_por_jogo: stats.seasonPPG_overall ?? null,
    },
    medias: {
      gols_marcados: stats.seasonScoredAVG_overall ?? null,
      gols_sofridos: stats.seasonConcededAVG_overall ?? null,
      gols_totais: stats.seasonAVG_overall ?? null,
    },
    percentuais: {
      over_25: stats.seasonOver25Percentage_overall ?? null,
      btts: stats.seasonBTTSPercentage_overall ?? null,
      clean_sheet: stats.seasonCSPercentage_overall ?? null,
      sem_marcar: stats.seasonFTSPercentage_overall ?? null,
    },
    reforcos: {
      xg_medio: additional.xg_for_overall ?? stats.xg_for_avg_overall ?? null,
      xg_contra: additional.xg_against_overall ?? stats.xg_against_avg_overall ?? null,
      ataques_perigosos: additional.dangerous_attacks_avg_overall ?? null,
      media_cartoes: stats.cardsAVG_overall ?? additional.cards_for_avg_overall ?? null,
      media_finalizacoes: stats.shotsAVG_overall ?? additional.shots_total_avg_overall ?? null,
    },
  };

  const texto = [
    `Time: ${summary.nome || 'n/d'}`,
    `Escopo: ${summary.escopo}`,
    `Registo: ${summary.recorde.vitorias ?? '-'}V/${summary.recorde.empates ?? '-'}E/${
      summary.recorde.derrotas ?? '-'
    }D`,
    `Médias: marca ${formatNumber(summary.medias.gols_marcados)} e sofre ${formatNumber(
      summary.medias.gols_sofridos,
    )} (total ${formatNumber(summary.medias.gols_totais)})`,
    `Percentuais: Over 2.5 ${formatPercent(summary.percentuais.over_25)} | BTTS ${formatPercent(
      summary.percentuais.btts,
    )} | Clean Sheet ${formatPercent(summary.percentuais.clean_sheet)} | Não marca ${formatPercent(
      summary.percentuais.sem_marcar,
    )}`,
    summary.forma_curta ? `Sequência: ${summary.forma_curta}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    ...summary,
    resumo_textual: texto,
  };
};

const matchDetailSchema = z.object({
  match_id: z
    .number({
      required_error: 'match_id é obrigatório',
      invalid_type_error: 'match_id deve ser numérico',
    })
    .int()
    .positive()
    .describe('match_id existente em stats_match_details.'),
});

const lastxSchema = z.object({
  team_id: z
    .number({
      required_error: 'team_id é obrigatório',
      invalid_type_error: 'team_id deve ser numérico',
    })
    .int()
    .positive()
    .describe('ID do time em team_lastx_stats.'),
  last_x_match_num: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Quantidade de jogos. Padrão: 10.'),
});

const createMatchDetailTool = async () => {
  const DynamicStructuredTool = await loadToolClass();

  return new DynamicStructuredTool({
    name: 'match_detail_raw',
    description:
      'Retorna o raw_payload completo de stats_match_details para um match_id específico. Use para análises detalhadas do confronto.',
    schema: matchDetailSchema,
    func: async ({ match_id }) => {
      const query = 'SELECT raw_payload FROM stats_match_details WHERE match_id = $1 LIMIT 1;';
      const params = [match_id];
      const { rows } = await runQuery(query, params);
      if (!rows.length) {
        return JSON.stringify({
          match_id,
          raw_payload: null,
          found: false,
          executed_sql: query,
          executed_params: params,
        });
      }
      return JSON.stringify({
        match_id,
        raw_payload: rows[0].raw_payload,
        found: true,
        executed_sql: query,
        executed_params: params,
      });
    },
  });
};

const createLastxTool = async () => {
  const DynamicStructuredTool = await loadToolClass();

  return new DynamicStructuredTool({
    name: 'team_lastx_raw',
    description:
      'Resumo estruturado (em português) de team_lastx_stats para um team_id, priorizando registros com last_x_match_num = 10.',
    schema: lastxSchema,
    func: async ({ team_id, last_x_match_num = 10 }) => {
      const lastX = typeof last_x_match_num === 'number' ? last_x_match_num : 10;
      const primaryQuery = `
        SELECT raw_payload, window_scope, last_x_match_num
          FROM team_lastx_stats
         WHERE team_id = $1
           AND last_x_match_num = $2
         ORDER BY last_updated_match_timestamp DESC
         LIMIT 1;
      `;
      const params = [team_id, lastX];
      let { rows } = await runQuery(primaryQuery, params);
      let fallbackUsed = false;
      let executedSql = primaryQuery;
      let executedParams = params;
      if (!rows.length) {
        const fallbackQuery = `
          SELECT raw_payload, window_scope, last_x_match_num
            FROM team_lastx_stats
           WHERE team_id = $1
           ORDER BY last_x_match_num DESC, last_updated_match_timestamp DESC
           LIMIT 1;
        `;
        executedSql = fallbackQuery;
        executedParams = [team_id];
        ({ rows } = await runQuery(fallbackQuery, executedParams));
        fallbackUsed = true;
      }
      if (!rows.length) {
        return JSON.stringify({
          team_id,
          requested_last_x: lastX,
          resumo: null,
          found: false,
          executed_sql: executedSql,
          executed_params: executedParams,
        });
      }
      const resumo = buildLastxSummary(rows[0].raw_payload);
      return JSON.stringify({
        team_id,
        requested_last_x: lastX,
        window_scope: rows[0].window_scope,
        used_last_x: rows[0].last_x_match_num,
        resumo,
        found: Boolean(resumo),
        fallback_used: fallbackUsed && rows[0].last_x_match_num !== lastX,
        executed_sql: executedSql,
        executed_params: executedParams,
      });
    },
  });
};

const createAnalysisTools = async () => {
  const [matchDetailTool, lastxTool] = await Promise.all([createMatchDetailTool(), createLastxTool()]);
  return [matchDetailTool, lastxTool];
};

module.exports = {
  createAnalysisTools,
};


