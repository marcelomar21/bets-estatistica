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
    reasoning: { effort: 'minimal' },
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
        parts.push(`CTAs disponiveis (varie entre eles): ${toneConfig.ctaTexts.join(', ')}`);
      } else if (toneConfig.ctaText) {
        parts.push(`CTA padrao: ${toneConfig.ctaText}`);
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

      const styleInstruction = effectiveExamples.length === 1
        ? 'Siga o MESMO formato, estilo e tom do exemplo'
        : 'Siga o estilo e formato dos exemplos';

      const fullHumanMessage = `Gere uma postagem COMPLETA para Telegram seguindo EXATAMENTE o estilo e formato ${effectiveExamples.length === 1 ? 'do exemplo abaixo' : 'dos exemplos abaixo'}.

${examplesBlock}

DADOS DA APOSTA:
- Jogo: ${bet.homeTeamName} x ${bet.awayTeamName}
- Mercado: ${bet.betMarket}
- Pick: ${bet.betPick || 'N/A'}
- ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed?.(2) || 'N/A'}
- Kickoff: ${bet.kickoffTime ? (formatDateTimeBR(bet.kickoffTime) || 'N/A') : 'N/A'}
- Link: ${bet.deepLink || 'N/A'}
${bet.reasoning ? `- Analise: ${bet.reasoning}` : ''}

Regras:
- ${styleInstruction}
- Use os DADOS reais da aposta (nao copie dados do exemplo)
- Mantenha emojis e formatacao similares ao exemplo
- A mensagem deve estar PRONTA para enviar no Telegram
- Use formatacao Markdown do Telegram (*bold*, _italic_)
- NAO adicione explicacoes, apenas a mensagem final
- Portugues BR`;

      const chatPrompt = ChatPromptTemplate.fromMessages([
        ['system', fullSystemMessage],
        ['human', fullHumanMessage],
      ]);

      const chain = chatPrompt.pipe(llmFull);
      const response = await chain.invoke({});
      const fullCopy = response.content.trim();

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
        parts.push(`CTAs disponiveis (varie entre eles): ${toneConfig.ctaTexts.join(', ')}`);
      } else if (toneConfig.ctaText) {
        parts.push(`CTA padrao: ${toneConfig.ctaText}`);
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
- Cada bullet deve ter no maximo 40 caracteres
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

    // Limitar a 5 bullets e limpar formatação
    const bullets = copy
      .split('\n')
      .filter(line => line.trim().startsWith('•'))
      .slice(0, 5)
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

module.exports = {
  generateBetCopy,
};
