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
  window_scope: z
    .string()
    .optional()
    .describe('Escopo desejado (ex: overall, home, away). Se omitido, usa o último registro disponível.'),
});

const createMatchDetailTool = async () => {
  const DynamicStructuredTool = await loadToolClass();

  return new DynamicStructuredTool({
    name: 'match_detail_raw',
    description:
      'Retorna o raw_payload completo de stats_match_details para um match_id específico. Use para análises detalhadas do confronto.',
    schema: matchDetailSchema,
    func: async ({ match_id }) => {
      const { rows } = await runQuery(
        'SELECT raw_payload FROM stats_match_details WHERE match_id = $1 LIMIT 1;',
        [match_id],
      );
      if (!rows.length) {
        return JSON.stringify({ match_id, raw_payload: null, found: false });
      }
      return JSON.stringify({ match_id, raw_payload: rows[0].raw_payload, found: true });
    },
  });
};

const createLastxTool = async () => {
  const DynamicStructuredTool = await loadToolClass();

  return new DynamicStructuredTool({
    name: 'team_lastx_raw',
    description:
      'Retorna o raw_payload de team_lastx_stats para um team_id (overall/home/away). Ideal para extração de forma recente.',
    schema: lastxSchema,
    func: async ({ team_id, window_scope = null }) => {
      const scope = window_scope ? String(window_scope).trim().toLowerCase() : null;
      const { rows } = await runQuery(
        `
          SELECT raw_payload, window_scope
            FROM team_lastx_stats
           WHERE team_id = $1
             AND ($2::text IS NULL OR LOWER(window_scope) = LOWER($2))
           ORDER BY last_x_match_num DESC
           LIMIT 1;
        `,
        [team_id, scope],
      );
      if (!rows.length) {
        return JSON.stringify({ team_id, window_scope: scope, raw_payload: null, found: false });
      }
      return JSON.stringify({
        team_id,
        window_scope: rows[0].window_scope,
        raw_payload: rows[0].raw_payload,
        found: true,
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


