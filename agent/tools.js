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
      'Retorna o raw_payload de team_lastx_stats para um team_id, priorizando registros com last_x_match_num = 10.',
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
          raw_payload: null,
          found: false,
          executed_sql: executedSql,
          executed_params: executedParams,
        });
      }
      return JSON.stringify({
        team_id,
        requested_last_x: lastX,
        window_scope: rows[0].window_scope,
        used_last_x: rows[0].last_x_match_num,
        raw_payload: rows[0].raw_payload,
        found: true,
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


