// Mirrors bot/services/copyService.js — keep in sync
import OpenAI from 'openai';

interface BetData {
  homeTeamName: string;
  awayTeamName: string;
  betMarket: string;
  betPick?: string;
  odds?: number;
  kickoffTime?: string;
  deepLink?: string;
  reasoning?: string;
}

interface ToneConfig {
  persona?: string;
  tone?: string;
  forbiddenWords?: string[];
  ctaText?: string;
  customRules?: string[];
  rawDescription?: string;
  examplePost?: string;
}

interface CopyResult {
  copy: string;
  fullMessage: boolean;
}

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildToneSystemParts(toneConfig: ToneConfig): string {
  const parts: string[] = [];
  if (toneConfig.persona) parts.push(`Persona: ${toneConfig.persona}`);
  if (toneConfig.tone) parts.push(`Tom: ${toneConfig.tone}`);
  if (toneConfig.forbiddenWords && toneConfig.forbiddenWords.length > 0) {
    parts.push(`Palavras PROIBIDAS (NUNCA use): ${toneConfig.forbiddenWords.join(', ')}`);
  }
  if (toneConfig.ctaText) parts.push(`CTA padrao: ${toneConfig.ctaText}`);
  if (toneConfig.customRules && toneConfig.customRules.length > 0) {
    parts.push(`Regras customizadas:\n${toneConfig.customRules.map(r => `- ${r}`).join('\n')}`);
  }
  if (toneConfig.rawDescription) parts.push(`Descricao geral do tom: ${toneConfig.rawDescription}`);
  return parts.length > 0 ? '\n\nCONFIGURACAO DE TOM DE VOZ:\n' + parts.join('\n') : '';
}

export async function generatePreviewCopy(
  bet: BetData,
  toneConfig: ToneConfig | null
): Promise<CopyResult> {
  const client = getClient();

  // Full-message mode when examplePost is provided
  if (toneConfig?.examplePost) {
    let systemMessage = 'Voce e um copywriter de apostas esportivas. Gere mensagens de postagem completas para Telegram.';
    if (toneConfig) {
      systemMessage += buildToneSystemParts(toneConfig);
    }

    const userMessage = `Gere uma postagem COMPLETA para Telegram seguindo EXATAMENTE o estilo e formato do exemplo abaixo.

EXEMPLO DE REFERENCIA:
${toneConfig.examplePost}

DADOS DA APOSTA:
- Jogo: ${bet.homeTeamName} x ${bet.awayTeamName}
- Mercado: ${bet.betMarket}
- Pick: ${bet.betPick || 'N/A'}
- Odd: ${bet.odds?.toFixed(2) || 'N/A'}
- Kickoff: ${bet.kickoffTime || 'N/A'}
- Link: ${bet.deepLink || 'N/A'}
${bet.reasoning ? `- Analise: ${bet.reasoning}` : ''}

Regras:
- Siga o MESMO formato, estilo e tom do exemplo
- Use os DADOS reais da aposta (nao copie dados do exemplo)
- Mantenha emojis e formatacao similares ao exemplo
- A mensagem deve estar PRONTA para enviar no Telegram
- Use formatacao Markdown do Telegram (*bold*, _italic_)
- NAO adicione explicacoes, apenas a mensagem final
- Portugues BR`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    });

    return {
      copy: response.choices[0]?.message?.content?.trim() || '',
      fullMessage: true,
    };
  }

  // Bullet-point mode (default)
  let systemMessage = 'Voce e um copywriter de apostas esportivas. Extrai dados estatisticos em bullet points curtos e engajantes.';
  if (toneConfig) {
    systemMessage += buildToneSystemParts(toneConfig);
  }

  const userMessage = `Extraia os dados estatisticos do texto abaixo em bullet points curtos.

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

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 200,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage },
    ],
  });

  const rawCopy = response.choices[0]?.message?.content?.trim() || '';

  // Filter to bullet lines only, max 5
  const bullets = rawCopy
    .split('\n')
    .filter(line => line.trim().startsWith('•'))
    .slice(0, 5)
    .join('\n');

  return {
    copy: bullets || rawCopy,
    fullMessage: false,
  };
}
