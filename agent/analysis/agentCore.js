const path = require('path');
const fs = require('fs-extra');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { ToolMessage, HumanMessage } = require('@langchain/core/messages');
const { z } = require('zod');

const { config } = require('../../lib/config');
const { systemPrompt, humanTemplate } = require('./prompt');
const { createAnalysisTools } = require('../tools');

const MAX_AGENT_STEPS = Number(process.env.AGENT_MAX_STEPS || 6);
const MAX_STRUCTURED_RETRIES = 2;
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

const SAFE_BET_CATEGORIES = ['gols', 'cartoes', 'escanteios', 'extra'];

const baseBetSchema = z.object({
  title: z
    .string()
    .min(8, 'Título da recomendação precisa ser descritivo.')
    .describe('Frase imperativa breve (ex: "Aposte em under 3,5").'),
  reasoning: z
    .string()
    .min(30, 'Explique com dados concretos.')
    .describe('Parágrafo curto justificando com números coletados.'),
});

const safeBetSchema = baseBetSchema
  .extend({
    category: z
      .enum(SAFE_BET_CATEGORIES)
      .describe('Tema abordado: gols, cartoes, escanteios ou extra.'),
  })
  .superRefine((bet, ctx) => {
    const normalized = bet.title.toLowerCase();
    if (/(vit[oó]ria|vencer|win|handicap|moneyline|1x2)/i.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Safe bet não pode tratar de vitória/handicap.',
        path: ['title'],
      });
    }
  });

const valueBetSchema = baseBetSchema.extend({
  angle: z
    .enum(['vitoria', 'handicap', 'gols', 'cartoes', 'escanteios', 'especial'])
    .optional()
    .describe('Identifique o ângulo principal da aposta de valor.'),
});

const structuredAnalysisSchema = z.object({
  overview: z
    .string()
    .min(80, 'Contextualize o jogo com métricas objetivas.')
    .describe(
      'Texto corrido usado após o título "Análise Baseada nos Dados Brutos".',
    ),
  safe_bets: z
    .array(safeBetSchema)
    .length(4)
    .superRefine((bets, ctx) => {
      const categories = new Set(bets.map((bet) => bet.category));
      SAFE_BET_CATEGORIES.forEach((category) => {
        if (!categories.has(category)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Inclua uma recomendação de ${category}.`,
          });
        }
      });
    })
    .describe('Lista fixa de 4 apostas conservadoras por tema.'),
  value_bets: z
    .array(valueBetSchema)
    .min(3)
    .max(4)
    .describe('Lista numerada de oportunidades agressivas.'),
});

const STRUCTURED_FORMAT_INSTRUCTIONS = `Responda com JSON puro (sem cercas de código):
{
  "overview": "string (min 80 chars) - Análise contextual com métricas objetivas dos dados coletados",
  "safe_bets": [
    { "title": "string (min 8 chars) - Frase imperativa", "reasoning": "string (min 30 chars) - Justificativa com dados", "category": "gols|cartoes|escanteios|extra" }
  ] (exatamente 4 objetos, um para cada category: gols, cartoes, escanteios, extra),
  "value_bets": [
    { "title": "string (min 8 chars) - Frase imperativa", "reasoning": "string (min 30 chars) - Justificativa com dados", "angle": "vitoria|handicap|gols|cartoes|escanteios|especial" }
  ] (entre 3 e 4 objetos)
}`;

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

const pickStatValue = (stats, keys = []) => {
  if (!stats || typeof stats !== 'object') return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(stats, key)) {
      const value = sanitizeStatValue(stats[key]);
      if (value !== null && value !== undefined) {
        return value;
      }
    }
  }
  return null;
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
  const corners = summary.corners || {};
  const cards = summary.cards || {};
  const extraLines = [];
  if (corners.for_avg !== null || corners.against_avg !== null) {
    extraLines.push(
      `- Escanteios: cobra ${formatNumber(corners.for_avg, 2)} e cede ${formatNumber(
        corners.against_avg,
        2,
      )} por jogo`,
    );
  }
  if (cards.for_avg !== null || cards.against_avg !== null) {
    extraLines.push(
      `- Cartões: recebe ${formatNumber(cards.for_avg, 2)} e provoca ${formatNumber(
        cards.against_avg,
        2,
      )} por partida`,
    );
  }

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
  )} | Clean Sheets ${formatPercent(percentages.clean_sheet)}${extraLines.length ? `\n${extraLines.join('\n')}` : ''}`;
};

const normalizePortugueseTerminology = (text = '') => {
  if (!text || typeof text !== 'string') return text;
  let normalized = text;
  normalized = normalized.replace(/\b[Cc]antos\b/g, 'escanteios').replace(/\b[Cc]anto\b/g, 'escanteio');
  normalized = normalized.replace(/BTTS\s+Yes/gi, 'BTTS (ambas as equipes marcam)');
  normalized = normalized.replace(/\bBTTS\b(?!\s*\()/gi, 'BTTS (ambas as equipes marcam)');
  normalized = normalized.replace(/\bOver\b/gi, 'mais de');
  normalized = normalized.replace(/\bUnder\b/gi, 'menos de');
  return normalized;
};

const GOAL_DIRECTION_KEYWORDS = {
  over: ['mais de', 'acima de', 'superior a', 'over'],
  under: ['menos de', 'abaixo de', 'inferior a', 'under'],
};

const BTTS_DIRECTION_KEYWORDS = {
  yes: ['btts: sim', 'btts sim', 'ambas as equipes marcam', 'ambas marcam', 'both teams score'],
  no: ['btts: nao', 'btts nao', 'btts: não', 'btts não', 'sem btts', 'btts: n', 'ambas nao marcam', 'ambas não marcam'],
};

const removeDiacritics = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const classifyGoalDirection = (text = '') => {
  if (!text) return null;
  const normalized = removeDiacritics(text).toLowerCase();
  if (GOAL_DIRECTION_KEYWORDS.over.some((kw) => normalized.includes(kw))) {
    return 'over';
  }
  if (GOAL_DIRECTION_KEYWORDS.under.some((kw) => normalized.includes(kw))) {
    return 'under';
  }
  return null;
};

const classifyBttsDirection = (text = '') => {
  if (!text) return null;
  const normalized = removeDiacritics(text).toLowerCase();
  if (BTTS_DIRECTION_KEYWORDS.yes.some((kw) => normalized.includes(kw))) {
    return 'yes';
  }
  if (BTTS_DIRECTION_KEYWORDS.no.some((kw) => normalized.includes(kw))) {
    return 'no';
  }
  return null;
};

const ensureAnalysisConsistency = (structured) => {
  if (!structured) return;
  const safeGoalBet = (structured.safe_bets || []).find((bet) => bet.category === 'gols');
  if (safeGoalBet) {
    const safeDirection = classifyGoalDirection(`${safeGoalBet.title || ''} ${safeGoalBet.reasoning || ''}`);
    if (safeDirection) {
      const conflictingBet = (structured.value_bets || []).find((bet) => {
        const direction = classifyGoalDirection(`${bet.title || ''} ${bet.reasoning || ''}`);
        return direction && direction !== safeDirection;
      });
      if (conflictingBet) {
        throw new Error(
          `a linha segura aponta para "${safeGoalBet.title}" (${safeDirection}) e "${conflictingBet.title}" sugere direção oposta.`,
        );
      }
    }
  }

  const safeBttsBet = (structured.safe_bets || []).find((bet) =>
    classifyBttsDirection(`${bet.title || ''} ${bet.reasoning || ''}`),
  );
  if (!safeBttsBet) return;
  const safeBttsDirection = classifyBttsDirection(`${safeBttsBet.title || ''} ${safeBttsBet.reasoning || ''}`);
  if (!safeBttsDirection) return;
  const conflictingBttsBet = (structured.value_bets || []).find((bet) => {
    const direction = classifyBttsDirection(`${bet.title || ''} ${bet.reasoning || ''}`);
    return direction && direction !== safeBttsDirection;
  });
  if (conflictingBttsBet) {
    throw new Error(
      `a linha segura define BTTS como "${safeBttsBet.title}" (${safeBttsDirection}) e "${conflictingBttsBet.title}" aponta para direção contrária.`,
    );
  }
};

const formatStructuredBetList = (bets, { showCategory = false } = {}) => {
  if (!Array.isArray(bets) || bets.length === 0) {
    return 'Nenhuma recomendação disponível.';
  }
  const formatted = bets
    .map((bet, index) => {
      const title = (bet.title || '').trim() || `Recomendação ${index + 1}`;
      const reasoning = (bet.reasoning || '').trim();
      const label = showCategory
        ? bet.category || bet.angle
          ? `[${(bet.category || bet.angle).toString()}] `
          : ''
        : '';
      return `**${index + 1}) ${label}${title}** — ${reasoning}`;
    })
    .join('\n');
  return normalizePortugueseTerminology(formatted);
};

const buildAnalysisTextFromStructured = (structured) => {
  const overview = (structured.overview || '').trim();
  const safeBlock = formatStructuredBetList(structured.safe_bets, {
    showCategory: true,
  });
  const valueBlock = formatStructuredBetList(structured.value_bets, {
    showCategory: true,
  });
  const text = [
    `Análise Baseada nos Dados Brutos: ${overview}`,
    `🛡️ Apostas Seguras (Bankroll Builder):\n${safeBlock}`,
    `🚀 Oportunidades (Valor):\n${valueBlock}`,
  ]
    .map((section) => section.trim())
    .join('\n\n')
    .trim();
  return normalizePortugueseTerminology(text);
};

const mapStructuredBetsToPayload = (bets = []) =>
  (Array.isArray(bets) ? bets : []).map((bet, index) => ({
    index: index + 1,
    titulo: normalizePortugueseTerminology((bet.title || '').trim()),
    justificativa: normalizePortugueseTerminology((bet.reasoning || '').trim()),
    categoria: bet.category || bet.angle || null,
  }));

const stripDecorators = (text = '') =>
  String(text)
    .replace(/^[\s\-–—•*]+/, '')
    .trim();

const extractTitleAndReasoningFromString = (raw) => {
  const cleaned = stripDecorators(raw);
  if (!cleaned) {
    return { title: 'Recomendação indefinida', reasoning: 'Sem detalhamento disponível.' };
  }
  const dashSplit = cleaned.split(/—| - | – /);
  if (dashSplit.length >= 2) {
    const [title, ...rest] = dashSplit;
    return { title: title.trim(), reasoning: rest.join('—').trim() || cleaned };
  }
  const commaIndex = cleaned.indexOf(',');
  if (commaIndex !== -1) {
    return {
      title: cleaned.slice(0, commaIndex).trim(),
      reasoning: cleaned.slice(commaIndex + 1).trim() || cleaned,
    };
  }
  return { title: cleaned, reasoning: cleaned };
};

const inferSafeCategory = (text, fallback = 'extra') => {
  const normalized = removeDiacritics(text);
  if (normalized.includes('cart') || normalized.includes('disciplin')) return 'cartoes';
  if (normalized.includes('escant') || normalized.includes('canto')) return 'escanteios';
  if (normalized.includes('gol') || normalized.includes('btts')) return 'gols';
  return fallback;
};

const inferValueAngle = (text = '') => {
  const normalized = removeDiacritics(text);
  if (normalized.includes('handicap')) return 'handicap';
  if (/(vitoria|vencer|win|moneyline|1x2)/i.test(normalized)) return 'vitoria';
  if (normalized.includes('escant') || normalized.includes('canto')) return 'escanteios';
  if (normalized.includes('cart')) return 'cartoes';
  if (normalized.includes('gol') || normalized.includes('btts')) return 'gols';
  return 'especial';
};

const normalizeBetEntry = (entry, { enforceCategory = false } = {}) => {
  if (!entry) return null;
  if (typeof entry === 'object') {
    const normalized = {
      title: (entry.title || entry.titulo || entry.note || '').trim(),
      reasoning: (
        entry.reasoning ||
        entry.justification ||
        entry.justificativa ||
        entry.content ||
        entry.description ||
        entry.rationale ||
        ''
      ).trim(),
    };
    if (!normalized.title || !normalized.reasoning) {
      return null;
    }
    if (enforceCategory) {
      normalized.category = entry.category || entry.categoria || null;
    } else if (entry.angle || entry.categoria) {
      normalized.angle = entry.angle || entry.categoria;
    }
    return normalized;
  }
  if (typeof entry === 'string') {
    return extractTitleAndReasoningFromString(entry);
  }
  return null;
};

const ensureSafeCategories = (bets) => {
  const categoryCounts = bets.reduce((acc, bet) => {
    if (bet.category) {
      acc[bet.category] = (acc[bet.category] || 0) + 1;
    }
    return acc;
  }, {});
  const missing = SAFE_BET_CATEGORIES.filter((category) => !bets.some((bet) => bet.category === category));
  if (!missing.length) {
    return bets;
  }
  const duplicates = bets.filter((bet) => (bet.category ? categoryCounts[bet.category] > 1 : false));
  for (const category of missing) {
    const candidate = duplicates.shift();
    if (!candidate) break;
    candidate.category = category;
  }
  const stillMissing = SAFE_BET_CATEGORIES.filter((category) => !bets.some((bet) => bet.category === category));
  if (stillMissing.length) {
    throw new Error(`A resposta não forneceu recomendações para: ${stillMissing.join(', ')}.`);
  }
  return bets;
};

const normalizeStructuredAnalysisFallback = (rawContent) => {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const overview =
    typeof parsed.overview === 'string'
      ? parsed.overview
      : Array.isArray(parsed.overview)
        ? parsed.overview.join(' ')
        : '';
  const rawSafe = Array.isArray(parsed.safe_bets) ? parsed.safe_bets : [];
  const rawValue = Array.isArray(parsed.value_bets) ? parsed.value_bets : [];
  if (rawSafe.length !== 4) {
    throw new Error('Quantidade inválida de apostas seguras no fallback.');
  }
  const safeBets = rawSafe
    .map((entry) => normalizeBetEntry(entry, { enforceCategory: true }))
    .map((bet) => {
      if (!bet) return null;
      const category = bet.category || inferSafeCategory(`${bet.title} ${bet.reasoning}`);
      return {
        ...bet,
        category,
      };
    })
    .filter(Boolean);
  ensureSafeCategories(safeBets);
  const valueBets = rawValue
    .map((entry) => normalizeBetEntry(entry))
    .filter(Boolean)
    .map((bet) => ({
      ...bet,
      angle: bet.angle || inferValueAngle(`${bet.title} ${bet.reasoning}`),
    }));
  if (!overview || !safeBets.length || !valueBets.length) {
    throw new Error('Falha ao normalizar o fallback do modelo.');
  }
  const normalized = {
    overview,
    safe_bets: safeBets,
    value_bets: valueBets,
  };
  ensureAnalysisConsistency(normalized);
  return normalized;
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

  const cornersForAvg = pickStatValue(stats, [
    'corners_for_avg_overall',
    'cornersAVG_overall',
    'cornersForAVG_overall',
  ]);
  const cornersAgainstAvg = pickStatValue(stats, [
    'corners_against_avg_overall',
    'cornersAgainstAVG_overall',
    'cornersAgainst_avg_overall',
  ]);
  const cardsForAvg = pickStatValue(stats, [
    'cards_for_avg_overall',
    'cardsAVG_overall',
    'cardsForAVG_overall',
  ]);
  const cardsAgainstAvg = pickStatValue(stats, [
    'cards_against_avg_overall',
    'cardsAgainstAVG_overall',
    'cardsAgainst_avg_overall',
  ]);

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
    corners: {
      for_avg: cornersForAvg,
      against_avg: cornersAgainstAvg,
    },
    cards: {
      for_avg: cardsForAvg,
      against_avg: cardsAgainstAvg,
    },
  };
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

const sanitizeDirName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .slice(0, 40);

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
    `Identificadores dos times: ${matchRow.home_team_name} (team_id=${matchRow.home_team_id}) | ${matchRow.away_team_name} (team_id=${matchRow.away_team_id}).`,
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
  } else {
    lines.push('Sem detalhes avançados (stats_match_details ausente nas últimas 48h).');
  }
  lines.push(describeLastX('Time da casa - forma recente', homeLastxSummary));
  lines.push(describeLastX('Time visitante - forma recente', awayLastxSummary));
  return `${lines.join('\n\n')}\n\nReferência SQL:\n${TABLE_SCHEMA_HINT}`;
};

const sanitizeToolOutput = (toolName, rawOutput) => {
  if (!rawOutput) return rawOutput;
  try {
    const parsed = JSON.parse(rawOutput);
    if (toolName === TOOL_NAMES.MATCH_DETAIL && parsed && typeof parsed === 'object') {
      if (parsed.raw_payload) {
        parsed.raw_payload = '[omitido para evitar payload multilíngue]';
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawOutput;
  }
};

const buildToolOutputText = (executions) => {
  if (!executions?.length) return '';
  return executions
    .map((exec, index) => {
      const header = `[#${index + 1}] ${exec.name}`;
      const sql = exec.args?.sql ? `SQL: ${exec.args.sql}` : null;
      const body = `Resultado:\n${sanitizeToolOutput(exec.name, exec.output)}`;
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

const runAgent = async ({ matchId, contextoJogo, matchRow }) => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', humanTemplate],
  ]);

  const llmConfig = {
    apiKey: ensureApiKey(),
    model: config.llm.heavyModel,
    timeout: Number(process.env.AGENT_TIMEOUT_MS ?? 180000),
  };
  if (process.env.AGENT_TEMPERATURE !== undefined) {
    llmConfig.temperature = Number(process.env.AGENT_TEMPERATURE);
  }

  const llm = new ChatOpenAI(llmConfig);

  const tools = await createAnalysisTools();
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const llmWithTools = llm.bindTools(tools);

  // Phase 2 model: structured output via API-native json_schema
  const llmStructured = llm.withStructuredOutput(structuredAnalysisSchema, { includeRaw: true });

  const baseMessages = await prompt.formatMessages({
    match_id: matchId,
    contexto_jogo: contextoJogo,
    format_instructions: STRUCTURED_FORMAT_INSTRUCTIONS,
  });

  const conversation = [...baseMessages];
  const toolExecutions = [];
  let finalMessage = null;
  let finalStructuredAnalysis = null;
  let hasSuccessfulToolCall = false;
  let usedMatchDetailTool = false;
  let usedLastxTool = false;
  const captureToolError = (err) => {
    return err instanceof Error ? err.message : String(err);
  };

  // ── Phase 1: Tool Calling Loop ──────────────────────────────────────
  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    infoLog(`Passo ${step + 1}: solicitando resposta do modelo (mensagens=${conversation.length}).`);
    const response = await llmWithTools.invoke(conversation);
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
      }
      // All required tools used — break to Phase 2
      infoLog(
        `Passo ${step + 1}: ferramentas obrigatórias utilizadas, avançando para structured output (match ${matchId}).`,
      );
      break;
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
      const timestampLabel = new Date().toISOString().replace(/[:.]/g, '-');
      const dumpDir = path.join(
        SQL_DUMPS_DIR,
        `${String(matchId)}_${sanitizeDirName(matchRow.home_team_name)}vs${sanitizeDirName(
          matchRow.away_team_name,
        )}`,
        timestampLabel,
      );
      const dumpPath = path.join(dumpDir, `step${step + 1}_call${dumpIndex}.json`);
      try {
        await fs.ensureDir(path.dirname(dumpPath));
      } catch { /* ignore directory creation errors */ }
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
            sql_executed: parsed.executed_sql ?? null,
            sql_params: parsed.executed_params ?? null,
            output: parsed,
          },
          { spaces: 2 },
        );
        hasSuccessfulToolCall = true;
      } catch {
        infoLog(`Ferramenta ${call.name} retornou payload não JSON (tamanho=${output?.length ?? 0}).`);
      }
      const sanitizedOutput = sanitizeToolOutput(call.name, output);
      toolExecutions.push({
        id: call.id,
        name: call.name,
        args,
        output: sanitizedOutput,
      });
      conversation.push(
        new ToolMessage({
          tool_call_id: call.id,
          content: sanitizedOutput,
        }),
      );
    }
  }

  // ── Phase 2: Structured Output ──────────────────────────────────────
  if (!hasSuccessfulToolCall) {
    throw new Error('Agente não executou ferramentas obrigatórias dentro do limite configurado.');
  }

  for (let attempt = 0; attempt < MAX_STRUCTURED_RETRIES; attempt++) {
    infoLog(`Structured output tentativa ${attempt + 1}/${MAX_STRUCTURED_RETRIES} (match ${matchId})...`);
    const { raw, parsed } = await llmStructured.invoke(conversation);
    try {
      ensureAnalysisConsistency(parsed);
      finalMessage = raw;
      finalStructuredAnalysis = parsed;
      infoLog(
        `Structured output OK na tentativa ${attempt + 1} (match ${matchId}).`,
      );
      break;
    } catch (err) {
      infoLog(`Inconsistência na tentativa ${attempt + 1}: ${err.message}`);
      conversation.push(raw);
      conversation.push(
        new HumanMessage(
          `As apostas ficaram incoerentes (${err.message}). Corrija mantendo coerência entre linhas seguras e de valor.`,
        ),
      );
    }
  }

  if (!finalStructuredAnalysis) {
    throw new Error('Agente não produziu análise estruturada válida após retries.');
  }

  const rawContent = extractMessageText(finalMessage.content);
  const analysisText = buildAnalysisTextFromStructured(finalStructuredAnalysis);

  debugLog('[agent][analysis] finalMessage', JSON.stringify(finalMessage, null, 2));
  debugLog('[agent][analysis] rawContent', rawContent);

  return {
    analysisText,
    structuredAnalysis: finalStructuredAnalysis,
    initialMessages: baseMessages.map(serializeMessage),
    finalMessage: serializeMessage(finalMessage),
    toolExecutions,
    rawContent,
  };
};

module.exports = {
  runAgent,
  // Exported for use by runAnalysis.js
  buildContextText,
  extractMatchDetailStats,
  extractLastXStats,
  buildToolOutputText,
  mapStructuredBetsToPayload,
  buildAnalysisTextFromStructured,
  parseJsonField,
  // Exported for testing
  ensureAnalysisConsistency,
  normalizeStructuredAnalysisFallback,
  extractMessageText,
  structuredAnalysisSchema,
  STRUCTURED_FORMAT_INSTRUCTIONS,
  TOOL_NAMES,
  MAX_STRUCTURED_RETRIES,
};
