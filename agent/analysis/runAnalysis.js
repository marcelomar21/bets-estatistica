#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const fs = require('fs-extra');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { ToolMessage, HumanMessage } = require('@langchain/core/messages');

const { systemPrompt, humanTemplate } = require('./prompt');
const { createAnalysisTools } = require('../tools');
const { runQuery, closePool } = require('../db');

const INTERMEDIATE_DIR = path.join(__dirname, '../../data/analises_intermediarias');
const MAX_AGENT_STEPS = Number(process.env.AGENT_MAX_STEPS || 6);
const SQL_DUMPS_DIR = path.join(__dirname, '../../data/sql_debug');
const TABLE_SCHEMA_HINT = `
Tabelas e colunas disponíveis para consultas SQL:
- league_matches(match_id, season_id, home_team_id, away_team_id, home_team_name, away_team_name, home_score, away_score, status, game_week, round_id, date_unix, kickoff_time, venue, raw_match, created_at, updated_at)
- league_seasons(season_id, league_name, display_name, country, season_year, raw_league, created_at, updated_at)
- stats_match_details(match_id, season_id, home_team_id, away_team_id, home_team_name, away_team_name, home_score, away_score, status, competition_stage, referee, venue, attendance, raw_payload, ordered_stats, created_at, updated_at)
- team_lastx_stats(team_id, team_name, country, season, competition_id, window_scope, last_x_match_num, last_updated_match_timestamp, risk, image_url, raw_payload, ordered_stats, created_at, updated_at)
- game_analysis(match_id, analysis_md, analysis_json, created_at, updated_at)
- suggested_bets(match_id, bet_market, bet_pick, odds, confidence, reasoning, risk_level, bet_category, created_at)
Use exatamente esses nomes de colunas (case-insensitive).`.trim();

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
  return value;
};

const debugLog = (...args) => {
  if (process.env.AGENT_DEBUG === 'true') {
    console.debug(...args);
  }
};

const infoLog = (...args) => {
  console.log('[agent][analysis]', ...args);
};

const sanitizeStatValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value === -1 ? null : value;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return null;
  }
  return num === -1 ? null : num;
};

const formatNumber = (value, digits = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/d';
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(digits);
};

const formatPercent = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/d';
  }
  return `${value.toFixed(1)}%`;
};

const describeLastX = (label, summary) => {
  if (!summary) {
    return `${label}: sem dados recentes disponíveis.`;
  }

  const record = summary.record || {};
  const averages = summary.averages || {};
  const percentages = summary.percentages || {};

  return `${label} (${summary.last_x || '?'} jogos ${summary.scope || 'escopo não informado'}):
- Resultado: ${record.wins ?? '-'}V/${record.draws ?? '-'}E/${record.losses ?? '-'}D | PPG ${formatNumber(
    averages.ppg,
    2,
  )}
- Médias: marca ${formatNumber(averages.scored_avg, 2)} e sofre ${formatNumber(averages.conceded_avg, 2)} (total ${formatNumber(
    averages.total_avg,
    2,
  )})
- Indicadores: BTTS ${formatPercent(percentages.btts)} | Over 2.5 ${formatPercent(
    percentages.over25,
  )} | Clean Sheets ${formatPercent(percentages.clean_sheet)}`;
};

const extractMatchDetailStats = (rawDetail) => {
  if (!rawDetail) return null;
  const data = rawDetail?.data?.data || rawDetail?.data || rawDetail;
  if (!data || typeof data !== 'object') return null;

  return {
    stadium: data.stadium_name || null,
    location: data.stadium_location || null,
    possession: {
      home: sanitizeStatValue(data.team_a_possession),
      away: sanitizeStatValue(data.team_b_possession),
    },
    shots: {
      total: {
        home: sanitizeStatValue(data.team_a_shots),
        away: sanitizeStatValue(data.team_b_shots),
      },
      on_target: {
        home: sanitizeStatValue(data.team_a_shotsOnTarget),
        away: sanitizeStatValue(data.team_b_shotsOnTarget),
      },
    },
    xg: {
      home: sanitizeStatValue(data.team_a_xg),
      away: sanitizeStatValue(data.team_b_xg),
      total: sanitizeStatValue(data.total_xg),
    },
    attacks: {
      dangerous: {
        home: sanitizeStatValue(data.team_a_dangerous_attacks),
        away: sanitizeStatValue(data.team_b_dangerous_attacks),
      },
      total: {
        home: sanitizeStatValue(data.team_a_attacks),
        away: sanitizeStatValue(data.team_b_attacks),
      },
    },
    potentials: {
      over_45: sanitizeStatValue(data.o45_potential),
      over_35: sanitizeStatValue(data.o35_potential),
      over_25: sanitizeStatValue(data.o25_potential),
      over_15: sanitizeStatValue(data.o15_potential),
      over_05: sanitizeStatValue(data.o05_potential),
      first_half_over_15: sanitizeStatValue(data.o15HT_potential),
      first_half_over_05: sanitizeStatValue(data.o05HT_potential),
    },
    narratives: data.trends || null,
  };
};

const scopeLabel = (scope) => {
  const normalized = typeof scope === 'number' ? scope : Number(scope);
  switch (normalized) {
    case 1:
      return 'como mandante';
    case 2:
      return 'como visitante';
    case 0:
    default:
      return 'no recorte geral';
  }
};

const extractLastXStats = (rawLastx) => {
  if (!rawLastx) return null;
  const dataset = rawLastx?.data?.data || rawLastx?.data || rawLastx;
  const entry = Array.isArray(dataset) ? dataset[0] : dataset;
  if (!entry) return null;
  const stats = entry.stats || {};

  return {
    team_name: entry.name || entry.full_name || null,
    scope: scopeLabel(entry.last_x_home_away_or_overall),
    last_x: entry.last_x_match_num || null,
    record: {
      wins: stats.seasonWinsNum_overall ?? null,
      draws: stats.seasonDrawsNum_overall ?? null,
      losses: stats.seasonLossesNum_overall ?? null,
    },
    averages: {
      scored_avg: stats.seasonScoredAVG_overall ?? null,
      conceded_avg: stats.seasonConcededAVG_overall ?? null,
      total_avg: stats.seasonAVG_overall ?? null,
      ppg: stats.seasonPPG_overall ?? null,
    },
    percentages: {
      over25: stats.seasonOver25Percentage_overall ?? null,
      btts: stats.seasonBTTSPercentage_overall ?? null,
      clean_sheet: stats.seasonCSPercentage_overall ?? null,
    },
  };
};

const exitWithError = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const parseMatchId = () => {
  const matchIdArg = process.argv[2];
  if (!matchIdArg) {
    exitWithError('Uso: node agent/analysis/runAnalysis.js <match_id>');
    process.exit(1);
  }
  const matchId = Number(matchIdArg);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    exitWithError('match_id deve ser um inteiro positivo.');
    process.exit(1);
  }
  return matchId;
};

const fetchMatchRow = async (matchId) => {
  const query = `
    SELECT lm.match_id,
           lm.season_id,
           lm.home_team_id,
           lm.away_team_id,
           lm.home_team_name,
           lm.away_team_name,
           lm.home_score,
           lm.away_score,
           lm.status,
           lm.game_week,
           lm.round_id,
           lm.date_unix,
           lm.kickoff_time,
           lm.venue,
           ls.league_name,
           ls.display_name AS competition_name,
           ls.country
      FROM league_matches lm
      LEFT JOIN league_seasons ls ON lm.season_id = ls.season_id
     WHERE lm.match_id = $1
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [matchId]);
  return rows[0] || null;
};

const fetchMatchDetail = async (matchId) => {
  const query = `
    SELECT raw_payload
      FROM stats_match_details
     WHERE match_id = $1
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [matchId]);
  return parseJsonField(rows[0]?.raw_payload) || null;
};

const fetchLastX = async (teamId) => {
  if (!teamId) return null;
  const query = `
    SELECT raw_payload
      FROM team_lastx_stats
     WHERE team_id = $1
     ORDER BY (CASE WHEN LOWER(window_scope) IN ('overall', 'geral') THEN 1 ELSE 0 END) DESC,
              last_x_match_num DESC
     LIMIT 1;
  `;
  const { rows } = await runQuery(query, [teamId]);
  if (!rows[0]) return null;
  return parseJsonField(rows[0].raw_payload) || null;
};

const formatDate = (value) => {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(date);
};

const buildContextText = (matchRow, detailStats, homeLastxSummary, awayLastxSummary) => {
  const lines = [];
  lines.push(
    `Campeonato: ${matchRow.competition_name || matchRow.league_name || 'Desconhecido'} (${matchRow.country ||
      'país não informado'})`,
  );
  lines.push(
    `Partida: ${matchRow.home_team_name} x ${matchRow.away_team_name} em ${formatDate(
      matchRow.kickoff_time,
    )} (match_id=${matchRow.match_id})`,
  );
  lines.push(
    `Status/placar atual: ${matchRow.status || 'pendente'} | ${matchRow.home_score ?? '-'}-${matchRow.away_score ??
      '-'}`,
  );
  if (detailStats) {
    if (detailStats.stadium || detailStats.location) {
      lines.push(
        `Local previsto: ${detailStats.stadium || 'Estádio não informado'}${
          detailStats.location ? ` (${detailStats.location})` : ''
        }`,
      );
    }
    if (detailStats.possession) {
      lines.push(
        `Posse estimada histórica: ${detailStats.possession.home ?? 'n/d'}% x ${detailStats.possession.away ?? 'n/d'}%`,
      );
    }
    if (detailStats.shots) {
      lines.push(
        `Histórico de finalizações: total ${formatNumber(detailStats.shots.total?.home ?? null, 0)} (casa) vs ${formatNumber(
          detailStats.shots.total?.away ?? null,
          0,
        )} (fora). No alvo: ${formatNumber(detailStats.shots.on_target?.home ?? null, 0)} x ${formatNumber(
          detailStats.shots.on_target?.away ?? null,
          0,
        )}`,
      );
    }
    if (detailStats.xg) {
      lines.push(
        `xG acumulado pelo fornecedor: casa ${formatNumber(detailStats.xg.home, 2)} vs visitante ${formatNumber(
          detailStats.xg.away,
          2,
        )} (total ${formatNumber(detailStats.xg.total, 2)})`,
      );
    }
    if (detailStats.attacks) {
      lines.push(
        `Ataques perigosos reportados: ${formatNumber(detailStats.attacks.dangerous?.home ?? null, 0)} x ${formatNumber(
          detailStats.attacks.dangerous?.away ?? null,
          0,
        )}`,
      );
    }
    if (detailStats.potentials) {
      lines.push(
        `Indicadores de potencial de gols do provedor: O2.5=${detailStats.potentials.over_25 ?? 'n/d'}, O1.5=${
          detailStats.potentials.over_15 ?? 'n/d'
        }, O0.5=${detailStats.potentials.over_05 ?? 'n/d'} | 1º tempo O0.5=${detailStats.potentials.first_half_over_05 ??
          'n/d'}`,
      );
    }
    if (detailStats.narratives) {
      lines.push(`Narrativas recentes: ${JSON.stringify(detailStats.narratives)}`);
    }
  } else {
    lines.push('Sem detalhes avançados (stats_match_details ausente nas últimas 48h).');
  }
  lines.push(describeLastX('Time da casa - forma recente', homeLastxSummary));
  lines.push(describeLastX('Time visitante - forma recente', awayLastxSummary));
  return `${lines.join('\n\n')}\n\nReferência SQL:\n${TABLE_SCHEMA_HINT}`;
};

const buildToolOutputText = (executions) => {
  if (!executions?.length) return '';
  return executions
    .map((exec, index) => {
      const header = `[#${index + 1}] ${exec.name}`;
      const sql = exec.args?.sql ? `SQL: ${exec.args.sql}` : null;
      const body = `Resultado:\n${exec.output}`;
      return [header, sql, body].filter(Boolean).join('\n');
    })
    .join('\n\n');
};

const serializeMessage = (message) => {
  if (!message) return null;
  return {
    type: message._getType ? message._getType() : message.constructor?.name,
    content: message.content,
    additional_kwargs: message.additional_kwargs,
  };
};

const ensureApiKey = () => {
  const key = process.env.OPENAI_API_KEY || process.env.openai_api_key;
  if (!key) {
    throw new Error('OPENAI_API_KEY não configurada no ambiente.');
  }
  return key;
};

const extractMessageText = (content) => {
  if (!content) return '';
  const raw =
    Array.isArray(content)
      ? content
          .map((chunk) => {
            if (typeof chunk === 'string') return chunk;
            if (chunk?.text) return chunk.text;
            return '';
          })
          .join('')
      : content;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  const withoutFence = trimmed.replace(/^```[\w-]*\s*/i, '').replace(/```$/, '').trim();
  return withoutFence || trimmed;
};

const TOOL_NAMES = {
  MATCH_DETAIL: 'match_detail_raw',
  LASTX: 'team_lastx_raw',
};

const runAgent = async ({ matchId, contextoJogo }) => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', humanTemplate],
  ]);

  const llmConfig = {
    apiKey: ensureApiKey(),
    model: process.env.AGENT_MODEL || 'gpt-5-nano',
    timeout: Number(process.env.AGENT_TIMEOUT_MS ?? 180000),
  };
  if (process.env.AGENT_TEMPERATURE !== undefined) {
    llmConfig.temperature = Number(process.env.AGENT_TEMPERATURE);
  }

  const llm = new ChatOpenAI(llmConfig);

  const tools = await createAnalysisTools();
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const llmWithTools = llm.bindTools(tools);

  const baseMessages = await prompt.formatMessages({
    match_id: matchId,
    contexto_jogo: contextoJogo,
  });

const conversation = [...baseMessages];
  const toolExecutions = [];
  let finalMessage = null;
  let hasSuccessfulToolCall = false;
let usedMatchDetailTool = false;
let usedLastxTool = false;
const captureToolError = (err) => {
  return err instanceof Error ? err.message : String(err);
};

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    infoLog(`Passo ${step + 1}: solicitando resposta do modelo (mensagens=${conversation.length}).`);
    let response;
    try {
      response = await llmWithTools.invoke(conversation);
    } catch (err) {
      throw err;
    }
    conversation.push(response);
    const finishReason = response.response_metadata?.finish_reason || 'n/d';
    infoLog(
      `Passo ${step + 1}: modelo respondeu com ${response.tool_calls?.length || 0} chamadas de ferramenta (finish_reason=${finishReason}).`,
    );

    if (!response.tool_calls || response.tool_calls.length === 0) {
      const missingTools = [];
      if (!usedMatchDetailTool) missingTools.push(TOOL_NAMES.MATCH_DETAIL);
      if (!usedLastxTool) missingTools.push(TOOL_NAMES.LASTX);
      if (missingTools.length) {
        conversation.push(
          new HumanMessage(
            `Antes de concluir, use as ferramentas obrigatórias: ${missingTools.join(
              ', ',
            )}. Utilize os IDs fornecidos no contexto.`,
          ),
        );
        continue;
      }
      if (!hasSuccessfulToolCall) {
        infoLog('Modelo tentou responder sem consultar o banco; reenviando instruções.');
        conversation.push(
          new HumanMessage(
            'Você ainda não consultou o banco. Utilize as ferramentas match_detail_raw e team_lastx_raw com os IDs do contexto antes de redigir a análise.',
          ),
        );
        continue;
      } else {
        finalMessage = response;
      infoLog(
          `Passo ${step + 1}: modelo forneceu resposta final após ${toolExecutions.length} consulta(s) (match ${matchId}).`,
      );
        break;
      }
    }

    for (const call of response.tool_calls) {
      const tool = toolMap.get(call.name);
      if (!tool) {
        throw new Error(`Ferramenta desconhecida solicitada: ${call.name}`);
      }
      let args = call.args ?? {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args || '{}');
        } catch (err) {
          throw new Error(`Args inválidos para ferramenta ${call.name}: ${args}`);
        }
      }
      const inputPreview =
        typeof args === 'object' ? JSON.stringify(args).slice(0, 200) : String(args).slice(0, 200);
      infoLog(`Executando ferramenta ${call.name} (id=${call.id}) com args: ${inputPreview} (match ${matchId}).`);
      if (call.name === TOOL_NAMES.MATCH_DETAIL) {
        usedMatchDetailTool = true;
      }
      if (call.name === TOOL_NAMES.LASTX) {
        usedLastxTool = true;
      }
      let output;
      try {
        output = await tool.invoke(args);
      } catch (toolErr) {
        infoLog(`Falha na ferramenta ${call.name}: ${captureToolError(toolErr)}. Reforce a consulta e tente novamente.`);
        conversation.push(
          new ToolMessage({
            tool_call_id: call.id,
            content: `Erro na consulta (${captureToolError(
              toolErr,
            )}). Ajuste o SQL para usar tabelas/colunas válidas e tente novamente.`,
          }),
        );
        continue;
      }
      const dumpIndex = toolExecutions.length + 1;
      const dumpPath = path.join(SQL_DUMPS_DIR, String(matchId), `step${step + 1}_call${dumpIndex}.json`);
      try {
        await fs.ensureDir(path.dirname(dumpPath));
      } catch {}
      try {
        const parsed = JSON.parse(output);
        await fs.writeJson(
          dumpPath,
          {
            match_id: matchId,
            step: step + 1,
            tool_call: dumpIndex,
            tool_name: call.name,
            input: args,
            output: parsed,
          },
          { spaces: 2 },
        );
        hasSuccessfulToolCall = true;
      } catch {
        infoLog(`Ferramenta ${call.name} retornou payload não JSON (tamanho=${output?.length ?? 0}).`);
      }
      toolExecutions.push({
        id: call.id,
        name: call.name,
        args,
        output,
      });
      conversation.push(
        new ToolMessage({
          tool_call_id: call.id,
          content: output,
        }),
      );
    }
  }

  if (!finalMessage) {
    throw new Error('Agente não produziu resposta final dentro do limite configurado.');
  }

  const rawContent = extractMessageText(finalMessage.content);

  debugLog('[agent][analysis] finalMessage', JSON.stringify(finalMessage, null, 2));
  debugLog('[agent][analysis] rawContent', rawContent);

  if (!rawContent) {
    throw new Error('Modelo não retornou análise em texto.');
  }

  return {
    analysisText: rawContent.trim(),
    initialMessages: baseMessages.map(serializeMessage),
    finalMessage: serializeMessage(finalMessage),
    toolExecutions,
    rawContent,
  };
};

async function main() {
  const matchId = parseMatchId();
  await fs.ensureDir(INTERMEDIATE_DIR);

  const matchRow = await fetchMatchRow(matchId);
  if (!matchRow) {
    throw new Error(`match_id ${matchId} não encontrado em league_matches.`);
  }

  const [detailRaw, homeLastxRaw, awayLastxRaw] = await Promise.all([
    fetchMatchDetail(matchId),
    fetchLastX(matchRow.home_team_id),
    fetchLastX(matchRow.away_team_id),
  ]);

  const detailSummary = extractMatchDetailStats(detailRaw);
  const homeLastxSummary = extractLastXStats(homeLastxRaw);
  const awayLastxSummary = extractLastXStats(awayLastxRaw);

  const contextoJogo = buildContextText(matchRow, detailSummary, homeLastxSummary, awayLastxSummary);
  const agentResult = await runAgent({ matchId, contextoJogo });
  const toolOutputsText = buildToolOutputText(agentResult.toolExecutions);
  const persistedContextText = toolOutputsText
    ? `${contextoJogo}\n\n==== Saídas de ferramentas durante a execução ====\n${toolOutputsText}`
    : contextoJogo;

  const payload = {
    match_id: matchId,
    generated_at: new Date().toISOString(),
    context: {
      textual: persistedContextText,
      match_row: matchRow,
      detail_raw: detailRaw,
      detail_summary: detailSummary,
      home_lastx_raw: homeLastxRaw,
      home_lastx_summary: homeLastxSummary,
      away_lastx_raw: awayLastxRaw,
      away_lastx_summary: awayLastxSummary,
      tool_outputs_text: toolOutputsText || null,
    },
    agent: {
      model: process.env.AGENT_MODEL || 'gpt-5-nano',
      prompt_messages: agentResult.initialMessages,
      final_message: agentResult.finalMessage,
      tool_executions: agentResult.toolExecutions,
      raw_response: agentResult.rawContent,
    },
    output: {
      analise_texto: agentResult.analysisText,
      apostas_seguras: [],
      oportunidades: [],
    },
  };

  const outputFile = path.join(INTERMEDIATE_DIR, `${matchId}.json`);
  await fs.writeJson(outputFile, payload, { spaces: 2 });
  console.log(`Análise estruturada salva em ${outputFile}`);
}

main()
  .catch((err) => {
    console.error('[agent][analysis] Falha durante execução:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });


