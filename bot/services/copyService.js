/**
 * Copy Service - Generates bet copy via LLM
 *
 * Story 10.1: Copy Dinâmico com LLM
 *
 * Persistence is handled by the caller (getOrGenerateMessage in postBets.js).
 * This service is responsible ONLY for calling the LLM and returning the result.
 */
require('dotenv').config();

const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const logger = require('../../lib/logger');

const { config } = require('../../lib/config');
const { formatDateTimeBR } = require('../../lib/utils');

function getOpenAI() {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: config.llm.lightModel,
    reasoning: { effort: 'none' },
  });
}

/**
 * Generate engaging copy for a bet using LLM
 * @param {object} bet - Bet object with homeTeamName, awayTeamName, betMarket, betPick, odds, reasoning
 * @param {object|null} toneConfig - Tone configuration
 * @returns {Promise<{success: boolean, data?: {copy: string}, error?: object}>}
 */
async function generateBetCopy(bet, toneConfig = null) {
  if (!bet) {
    return {
      success: false,
      error: { code: 'INVALID_BET', message: 'No bet provided' }
    };
  }

  try {
    // Full-message mode when examplePost(s) are provided
    const effectiveExamples = toneConfig?.examplePosts?.length > 0 ? toneConfig.examplePosts : (toneConfig?.examplePost ? [toneConfig.examplePost] : []);
    if (effectiveExamples.length > 0) {
      const llmFull = getOpenAI();

      let fullSystemMessage = 'Voce e um copywriter de apostas esportivas. Gere mensagens de postagem completas para Telegram.';

      const parts = [];
      if (toneConfig.persona) parts.push(`Persona: ${toneConfig.persona}`);
      if (toneConfig.tone) parts.push(`Tom: ${toneConfig.tone}`);
      if (toneConfig.forbiddenWords?.length > 0) {
        parts.push(`Palavras PROIBIDAS (NUNCA use): ${toneConfig.forbiddenWords.join(', ')}`);
      }
      if (toneConfig.suggestedWords?.length > 0) {
        parts.push(`Palavras SUGERIDAS (tente usar quando apropriado): ${toneConfig.suggestedWords.join(', ')}`);
      }
      if (toneConfig.ctaTexts?.length > 0) {
        parts.push(`Chamados para acao disponiveis (varie entre eles): ${toneConfig.ctaTexts.join(', ')}`);
      } else if (toneConfig.ctaText) {
        parts.push(`Chamado para acao padrao: ${toneConfig.ctaText}`);
      }
      if (toneConfig.customRules?.length > 0) {
        parts.push(`Regras customizadas:\n${toneConfig.customRules.map(r => '- ' + r).join('\n')}`);
      }
      if (toneConfig.oddLabel && toneConfig.oddLabel !== '') parts.push(`Use "${toneConfig.oddLabel}" em vez de "Odd" para se referir as odds`);
      if (toneConfig.rawDescription) parts.push(`Descricao geral do tom: ${toneConfig.rawDescription}`);
      if (parts.length > 0) {
        fullSystemMessage += '\n\nCONFIGURACAO DE TOM DE VOZ:\n' + parts.join('\n');
      }

      const examplesBlock = effectiveExamples.length === 1
        ? `EXEMPLO DE REFERENCIA:\n${effectiveExamples[0]}`
        : `EXEMPLOS DE REFERENCIA:\n${effectiveExamples.map((ex, i) => `Exemplo ${i + 1}:\n${ex}`).join('\n\n')}`;

      // Structural enforcement: force the LLM to replicate all sections from the example
      fullSystemMessage += '\n\nFORMATO OBRIGATORIO:\nAnalise o(s) exemplo(s) de referencia e identifique as SECOES ESTRUTURAIS (header, analise, palpite, link, observacao, engajamento).\nSua resposta DEVE conter TODAS as mesmas secoes na mesma ordem.\nSe o exemplo tem uma secao de analise conversacional, sua resposta TAMBEM deve ter.\nSe o exemplo tem uma secao de "ponto de atencao", sua resposta TAMBEM deve ter.\nNAO simplifique o formato — replique a ESTRUTURA COMPLETA, nao apenas o conteudo.';

      // Fallback enrichment when reasoning is sparse
      const reasoningBlock = bet.reasoning && bet.reasoning.length > 100
        ? `- Analise: ${bet.reasoning}`
        : `- Analise: Gere uma analise conversacional curta baseada nos dados do mercado (${bet.betMarket}) e nos times envolvidos. Use o tom configurado.`;

      const fullHumanMessage = `Gere uma postagem COMPLETA para Telegram seguindo EXATAMENTE o estilo e formato ${effectiveExamples.length === 1 ? 'do exemplo abaixo' : 'dos exemplos abaixo'}.

${examplesBlock}

DADOS DA APOSTA:
- Jogo: ${bet.homeTeamName} x ${bet.awayTeamName}
- Mercado: ${bet.betMarket}
- Pick: ${bet.betPick || 'N/A'}
- ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed?.(2) || 'N/A'}
- Kickoff: ${bet.kickoffTime ? (formatDateTimeBR(bet.kickoffTime) || 'N/A') : 'N/A'}
- Link: ${bet.deepLink || 'N/A'}
${reasoningBlock}

Regras:
- Replique EXATAMENTE a estrutura do exemplo: mesmas secoes, mesmos emojis de secao, mesma ordem
- Se o exemplo tem multiplas secoes distintas, sua resposta DEVE ter o mesmo numero de secoes
- Use o TOM e VOCABULARIO do exemplo (informal/formal, girias, expressoes)
- Use os DADOS reais da aposta (nao copie dados do exemplo)
- Mantenha emojis e formatacao similares ao exemplo
- A mensagem deve estar PRONTA para enviar no Telegram
- Use formatacao Markdown do Telegram (*bold*, _italic_)
- NAO adicione explicacoes, apenas a mensagem final
- NAO simplifique ou encurte — mantenha o MESMO nivel de detalhe do exemplo
- Portugues BR`;

      const chatPrompt = ChatPromptTemplate.fromMessages([
        ['system', fullSystemMessage],
        ['human', fullHumanMessage],
      ]);

      const chain = chatPrompt.pipe(llmFull);
      const response = await chain.invoke({});
      let fullCopy = response.content.trim();

      // Structural validation: warn if output has significantly fewer sections than example
      const exampleSections = effectiveExamples[0].split('\n\n').filter(s => s.trim()).length;
      const outputSections = fullCopy.split('\n\n').filter(s => s.trim()).length;

      if (outputSections < exampleSections * 0.6) {
        logger.warn('Generated copy has fewer sections than example, retrying', {
          betId: bet.id,
          exampleSections,
          outputSections,
        });
        // Retry once with reinforced prompt
        const retryResponse = await chain.invoke({});
        const retryCopy = retryResponse.content.trim();
        const retrySections = retryCopy.split('\n\n').filter(s => s.trim()).length;
        if (retrySections > outputSections) {
          fullCopy = retryCopy;
          logger.info('Retry produced better structured copy', { betId: bet.id, retrySections });
        }
      }

      logger.info('Generated full message copy', {
        betId: bet.id,
        copyLength: fullCopy.length,
        match: `${bet.homeTeamName} x ${bet.awayTeamName}`
      });

      return { success: true, data: { copy: fullCopy, fullMessage: true, fromCache: false } };
    }

    const llm = getOpenAI();

    // Build system message with tone config injection
    let systemMessage = 'Voce e um copywriter de apostas esportivas. Extrai dados estatisticos em bullet points curtos e engajantes.';

    if (toneConfig) {
      const parts = [];
      if (toneConfig.persona) parts.push(`Persona: ${toneConfig.persona}`);
      if (toneConfig.tone) parts.push(`Tom: ${toneConfig.tone}`);
      if (toneConfig.forbiddenWords && toneConfig.forbiddenWords.length > 0) {
        parts.push(`Palavras PROIBIDAS (NUNCA use): ${toneConfig.forbiddenWords.join(', ')}`);
      }
      if (toneConfig.suggestedWords?.length > 0) {
        parts.push(`Palavras SUGERIDAS (tente usar quando apropriado): ${toneConfig.suggestedWords.join(', ')}`);
      }
      if (toneConfig.ctaTexts?.length > 0) {
        parts.push(`Chamados para acao disponiveis (varie entre eles): ${toneConfig.ctaTexts.join(', ')}`);
      } else if (toneConfig.ctaText) {
        parts.push(`Chamado para acao padrao: ${toneConfig.ctaText}`);
      }
      if (toneConfig.customRules && toneConfig.customRules.length > 0) {
        parts.push(`Regras customizadas:\n${toneConfig.customRules.map(r => `- ${r}`).join('\n')}`);
      }
      if (toneConfig.rawDescription) parts.push(`Descricao geral do tom: ${toneConfig.rawDescription}`);
      if (parts.length > 0) {
        systemMessage += '\n\nCONFIGURACAO DE TOM DE VOZ:\n' + parts.join('\n');
      }
    }

    const humanMessage = `Extraia os dados estatisticos do texto abaixo em bullet points curtos.

Texto:
${bet.reasoning || 'Sem analise disponivel'}

Regras:
- Extraia APENAS dados numericos/percentuais do texto
- Maximo 4-5 bullets
- Use "•" como marcador
- Abrevie nomes de times (ex: "Sampaio Correa RJ" → "Sampaio")
- Formato: "• Time: XX% dado" ou "• Dado: X,XX valor"
- NAO invente dados - use apenas o que esta no texto
- NAO use emojis
- Portugues BR
${toneConfig?.forbiddenWords?.length ? `- NUNCA use estas palavras: ${toneConfig.forbiddenWords.join(', ')}` : ''}

Exemplo de saida:
• Sampaio: 50% ambas marcam
• Botafogo: 60% ambas marcam
• Media ofensiva: 1,80 e 2,10 gols
• 70% jogos com 3+ gols

Responda APENAS com os bullets, sem texto adicional.`;

    const chatPrompt = ChatPromptTemplate.fromMessages([
      ['system', systemMessage],
      ['human', humanMessage],
    ]);

    const chain = chatPrompt.pipe(llm);
    const response = await chain.invoke({});
    const copy = response.content.trim();

    // Validate response - deve ter pelo menos um bullet
    if (!copy || !copy.includes('•')) {
      logger.warn('LLM returned invalid format', { betId: bet.id, copy });
      return {
        success: false,
        error: { code: 'INVALID_FORMAT', message: 'LLM did not return bullet format' }
      };
    }

    // Filtrar bullets da resposta LLM (quantidade controlada pelo prompt)
    const bullets = copy
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .join('\n');

    const finalCopy = bullets || copy;

    logger.info('Generated bet copy', {
      betId: bet.id,
      copyLength: finalCopy.length,
      match: `${bet.homeTeamName} x ${bet.awayTeamName}`
    });

    return { success: true, data: { copy: finalCopy, fullMessage: false, fromCache: false } };
  } catch (error) {
    logger.error('Failed to generate bet copy', {
      betId: bet.id,
      error: error.message
    });

    return {
      success: false,
      error: { code: 'LLM_ERROR', message: error.message }
    };
  }
}

/**
 * Generate a celebratory recap of yesterday's winning bets via LLM
 * @param {object} winsData - { wins: Array, winCount: number, totalCount: number, rate: number|null }
 * @param {object|null} toneConfig - Tone configuration (copyToneConfig from group)
 * @returns {Promise<{success: boolean, data?: {copy: string}, error?: object}>}
 */
async function generateWinsRecapCopy(winsData, toneConfig = null) {
  if (!winsData || winsData.winCount === 0) {
    return { success: false, error: { code: 'NO_WINS', message: 'No wins to recap' } };
  }

  try {
    const llm = getOpenAI();

    let systemMessage = 'Voce e um copywriter de apostas esportivas. Gere mensagens de recap celebrando os acertos do dia anterior para Telegram.';

    if (toneConfig) {
      const parts = [];
      if (toneConfig.persona) parts.push(`Persona: ${toneConfig.persona}`);
      if (toneConfig.tone) parts.push(`Tom: ${toneConfig.tone}`);
      if (toneConfig.forbiddenWords?.length > 0) {
        parts.push(`Palavras PROIBIDAS (NUNCA use): ${toneConfig.forbiddenWords.join(', ')}`);
      }
      if (toneConfig.suggestedWords?.length > 0) {
        parts.push(`Palavras SUGERIDAS (tente usar quando apropriado): ${toneConfig.suggestedWords.join(', ')}`);
      }
      if (toneConfig.ctaTexts?.length > 0) {
        parts.push(`Chamados para acao disponiveis (varie entre eles): ${toneConfig.ctaTexts.join(', ')}`);
      } else if (toneConfig.ctaText) {
        parts.push(`Chamado para acao padrao: ${toneConfig.ctaText}`);
      }
      if (toneConfig.customRules?.length > 0) {
        parts.push(`Regras customizadas:\n${toneConfig.customRules.map(r => '- ' + r).join('\n')}`);
      }
      if (toneConfig.oddLabel && toneConfig.oddLabel !== '') {
        parts.push(`Use "${toneConfig.oddLabel}" em vez de "Odd" para se referir as odds`);
      }
      if (toneConfig.rawDescription) parts.push(`Descricao geral do tom: ${toneConfig.rawDescription}`);
      if (parts.length > 0) {
        systemMessage += '\n\nCONFIGURACAO DE TOM DE VOZ:\n' + parts.join('\n');
      }
    }

    const winsList = (winsData.wins || []).map(w => {
      const home = w.league_matches?.home_team_name || '?';
      const away = w.league_matches?.away_team_name || '?';
      // Prefer per-group posting odds (bet_group_assignments), fall back to original analysis odds (suggested_bets.odds)
      const rawOdds = w.bet_group_assignments?.[0]?.odds_at_post ?? w.odds ?? null;
      const oddsSegment = rawOdds != null
        ? ` | ${toneConfig?.oddLabel || 'Odd'}: ${parseFloat(rawOdds).toFixed(2)}`
        : '';
      return `- ${home} x ${away} | Mercado: ${w.bet_market} | Pick: ${w.bet_pick || 'N/A'}${oddsSegment}`;
    }).join('\n');

    const humanMessage = `Gere uma mensagem de RECAP celebrando os acertos de ontem para o grupo de Telegram.

DADOS:
- Acertos: ${winsData.winCount}/${winsData.totalCount} (${winsData.rate?.toFixed(1) || 0}%)
- Jogos acertados:
${winsList}

Regras:
- Celebre os acertos sem arrogancia
- Mencione cada jogo acertado com mercado, pick e odd
- Inclua a taxa de acerto do dia (${winsData.winCount}/${winsData.totalCount})
- Emojis moderados (nao exagere)
- Inclua um chamado para acao no final convidando o leitor a continuar acompanhando ou apostar
- Formato: Markdown do Telegram (*bold*, _italic_)
- Portugues BR
- A mensagem deve estar PRONTA para enviar no Telegram
- NAO adicione explicacoes, apenas a mensagem final`;

    const chatPrompt = ChatPromptTemplate.fromMessages([
      ['system', systemMessage],
      ['human', humanMessage],
    ]);

    const chain = chatPrompt.pipe(llm);
    const response = await chain.invoke({});
    const copy = response.content.trim();

    // Strip literal "CTA" label from LLM output (safety net)
    // The CTA content should appear, but the technical label "CTA" must never be visible to end users
    const sanitizedCopy = copy
      .replace(/\bCTA\s*:\s*/gi, '')
      .replace(/\bCTA\s*-\s*/gi, '');

    logger.info('Generated wins recap copy', {
      winCount: winsData.winCount,
      totalCount: winsData.totalCount,
      copyLength: sanitizedCopy.length,
    });

    return { success: true, data: { copy: sanitizedCopy } };
  } catch (error) {
    logger.error('Failed to generate wins recap copy', { error: error.message });
    return { success: false, error: { code: 'LLM_ERROR', message: error.message } };
  }
}

module.exports = {
  generateBetCopy,
  generateWinsRecapCopy,
};
