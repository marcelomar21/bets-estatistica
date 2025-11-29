const { z } = require('zod');

const betSuggestionSchema = z.object({
  mercado: z.string().min(3, 'Descreva o mercado.'),
  pick: z.string().min(2, 'Informe a seleção ou cenário apostado.'),
  odds: z
    .union([z.number().positive(), z.string().min(1)])
    .optional()
    .describe('Odds decimais se disponíveis.'),
  confianca: z
    .number()
    .min(0, 'Confiança deve ser >= 0')
    .max(1, 'Confiança deve ser <= 1')
    .describe('Escala 0-1 indicando convicção.'),
  justificativa: z.string().min(10, 'Traga raciocínio claro para a aposta.'),
  risco: z.string().min(3, 'Indique o risco percebido (ex: baixo, moderado).'),
});

const analysisSchema = z.object({
  analise_texto: z
    .string()
    .min(50, 'Produza texto corrido contextualizando o jogo e apostas.'),
  apostas_seguras: z.array(betSuggestionSchema).default([]),
  oportunidades: z.array(betSuggestionSchema).default([]),
});

module.exports = {
  betSuggestionSchema,
  analysisSchema,
};


