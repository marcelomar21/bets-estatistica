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

const renderBetCard = (bet) => {
  const fields = [
    { label: 'Mercado', value: bet.mercado },
    { label: 'Pick', value: bet.pick },
    { label: 'Odds', value: formatOdds(bet.odds) },
    { label: 'Confiança', value: formatConfidence(bet.confianca) },
    { label: 'Risco', value: bet.risco },
  ].filter((field) => field.value !== undefined && field.value !== null && field.value !== '');

  const detailsHtml = fields
    .map(
      (field) =>
        `<div class="bet-field"><span class="label">${escapeHtml(field.label)}</span><span class="value">${escapeHtml(
          field.value,
        )}</span></div>`,
    )
    .join('');

  const reasoning = bet.justificativa
    ? `<p class="bet-reasoning">${escapeHtml(bet.justificativa)}</p>`
    : '';

  return `<article class="bet-card">
    ${detailsHtml}
    ${reasoning}
  </article>`;
};

const renderBetSection = (title, bets = []) => {
  if (!Array.isArray(bets) || bets.length === 0) {
    return `<section class="bets">
      <h2>${escapeHtml(title)}</h2>
      <p class="empty">Nenhuma recomendação disponível.</p>
    </section>`;
  }

  return `<section class="bets">
    <h2>${escapeHtml(title)}</h2>
    <div class="bet-grid">
      ${bets.map(renderBetCard).join('\n')}
    </div>
  </section>`;
};

const renderHtmlReport = (payload) => {
  const match = payload.context?.match_row || {};
  const detailSummary = payload.context?.detail_summary || null;
  const safeBets = payload.output?.apostas_seguras || [];
  const opportunityBets = payload.output?.oportunidades || [];
  const analysisHtml = paragraphsFromText(payload.output?.analise_texto);

  const title = `${match.home_team_name || 'Time da casa'} x ${match.away_team_name || 'Time visitante'}`;
  const competition = match.competition_name || match.league_name || 'Competição indefinida';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} – ${escapeHtml(competition)}</title>
    <style>
      :root {
        font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }
      body {
        margin: 0;
        padding: 32px;
      }
      .report {
        max-width: 900px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.1);
        padding: 48px;
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
      section {
        margin-top: 32px;
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
      }
      .bets h2 {
        margin-bottom: 12px;
      }
      .bet-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .bet-card {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        background: #fff;
      }
      .bet-field {
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
        margin-bottom: 6px;
      }
      .bet-field .label {
        font-weight: 600;
        color: #475569;
      }
      .bet-field .value {
        color: #0f172a;
      }
      .bet-reasoning {
        font-size: 0.9rem;
        color: #0f172a;
        margin-top: 12px;
      }
      .empty {
        color: #94a3b8;
        font-style: italic;
      }
      @media print {
        body {
          background: #fff;
          padding: 0;
        }
        .report {
          box-shadow: none;
          padding: 24px 32px;
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


