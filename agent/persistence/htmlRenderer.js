const { extractSections } = require('./analysisParser');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
};

const formatOdds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(2);
  }
  return String(value);
};

const formatConfidence = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatScore = (matchRow = {}) => {
  const formatSide = (score) => (Number.isFinite(score) ? score : '-');
  return `${formatSide(matchRow.home_score)} x ${formatSide(matchRow.away_score)}`;
};

const paragraphsFromText = (text) => {
  if (!text) return '<p>Sem análise disponível.</p>';
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
};

const renderContextSection = (matchRow = {}, detailSummary = null) => {
  const contextItems = [
    { label: 'Competição', value: matchRow.competition_name || matchRow.league_name },
    { label: 'País', value: matchRow.country },
    { label: 'Data/Hora', value: formatDateTime(matchRow.kickoff_time) },
    { label: 'Status', value: matchRow.status || 'Pendente' },
    { label: 'Placar', value: formatScore(matchRow) },
    { label: 'Estádio', value: detailSummary?.stadium || matchRow.venue },
    { label: 'Localização', value: detailSummary?.location },
  ].filter((item) => item.value);

  if (!contextItems.length) {
    return '';
  }

  const infoItems = contextItems
    .map(
      (item) =>
        `<div class="info-item"><span class="label">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(
          item.value,
        )}</span></div>`,
    )
    .join('\n');

  return `<section class="context">
    <h2>Contexto do Jogo</h2>
    <div class="info-grid">
      ${infoItems}
    </div>
  </section>`;
};

const normalizeLegacyBets = (bets = []) =>
  bets
    .map((bet, index) => {
      if (!bet || typeof bet !== 'object') return null;
      const title =
        bet.titulo ||
        bet.title ||
        bet.mercado ||
        bet.pick ||
        `Sugestão ${index + 1}`;
      const reasoning =
        bet.justificativa ||
        bet.reasoning ||
        bet.descricao ||
        bet.motivo ||
        null;
      if (!title || !reasoning) return null;
      return {
        index: bet.index ?? index + 1,
        title: title.trim(),
        reasoning: reasoning.trim(),
      };
    })
    .filter(Boolean);

const renderBetSection = (title, bets = []) => {
  if (!Array.isArray(bets) || bets.length === 0) {
    return `<section class="bets">
      <h2>${escapeHtml(title)}</h2>
      <p class="empty">Nenhuma recomendação disponível.</p>
    </section>`;
  }

  const listItems = bets
    .map(
      (bet, idx) => `<li class="bet-item">
        <div class="bet-index">${escapeHtml(String(bet.index ?? idx + 1))}</div>
        <div class="bet-content">
          <p class="bet-title">${escapeHtml(bet.title)}</p>
          <p class="bet-reasoning">${escapeHtml(bet.reasoning)}</p>
        </div>
      </li>`,
    )
    .join('\n');

  return `<section class="bets">
    <h2>${escapeHtml(title)}</h2>
    <ol class="bet-list">
      ${listItems}
    </ol>
  </section>`;
};

const renderHtmlReport = (payload) => {
  const match = payload.context?.match_row || {};
  const detailSummary = payload.context?.detail_summary || null;
  const {
    analysis: parsedAnalysis,
    safe: parsedSafe,
    opportunities: parsedOpp,
  } = extractSections(payload.output?.analise_texto || '');

  const safeBets =
    parsedSafe.length > 0
      ? parsedSafe
      : normalizeLegacyBets(payload.output?.apostas_seguras);
  const opportunityBets =
    parsedOpp.length > 0
      ? parsedOpp
      : normalizeLegacyBets(payload.output?.oportunidades);
  const analysisHtml = paragraphsFromText(parsedAnalysis || payload.output?.analise_texto);

  const title = `${match.home_team_name || 'Time da casa'} x ${match.away_team_name || 'Time visitante'}`;
  const competition = match.competition_name || match.league_name || 'Competição indefinida';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} – ${escapeHtml(competition)}</title>
    <style>
      @page {
        size: auto;
        margin: 0;
      }
      :root {
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #ffffff;
      }
      .report {
        max-width: 900px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.1);
        padding: 36px 42px 60px;
        display: flex;
        flex-direction: column;
        gap: 28px;
        page-break-inside: avoid;
      }
      header h1 {
        font-size: 2.4rem;
        margin: 0 0 0.8rem;
        color: #0f172a;
      }
      header p {
        margin: 0;
        color: #475569;
        font-size: 1.05rem;
      }
      .context .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .info-item {
        padding: 12px 16px;
        border-radius: 10px;
        background: #f1f5f9;
      }
      .info-item .label {
        display: block;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #94a3b8;
      }
      .info-item .value {
        font-size: 1rem;
        color: #0f172a;
      }
      .analysis p {
        line-height: 1.6;
        color: #1e293b;
        margin-bottom: 1.2em;
        font-style: italic;
      }
      .bets h2 {
        margin-bottom: 16px;
      }
      .bet-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bet-item {
        display: flex;
        gap: 16px;
        padding: 16px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        page-break-inside: avoid;
      }
      .bet-index {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #0f172a;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        flex-shrink: 0;
      }
      .bet-title {
        font-weight: 600;
        margin: 0 0 6px;
        color: #0f172a;
      }
      .bet-reasoning {
        margin: 0;
        color: #1e293b;
      }
      .empty {
        color: #94a3b8;
        font-style: italic;
      }
      @media print {
        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          background: #fff;
        }
        .report {
          box-shadow: none;
          border-radius: 0;
        }
      }
    </style>
  </head>
  <body>
    <article class="report">
      <header>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(competition)}</p>
      </header>

      ${renderContextSection(match, detailSummary)}

      <section class="analysis">
        <h2>Resumo Analítico</h2>
        ${analysisHtml}
      </section>

      ${renderBetSection('Apostas Seguras', safeBets)}
      ${renderBetSection('Oportunidades', opportunityBets)}
    </article>
  </body>
</html>`;
};

module.exports = {
  renderHtmlReport,
};


