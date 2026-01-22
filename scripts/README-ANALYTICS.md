# Scripts de Análise de Performance

Scripts para analisar a performance das apostas sugeridas pelo bot.

## Pré-requisitos

Todos os scripts precisam do arquivo `.env` configurado com as credenciais do Supabase.

```bash
cd /path/to/bets-estatistica
```

---

## 1. Exportar Bets para CSV

Exporta todas as apostas com resultados para um arquivo CSV completo.

```bash
node scripts/exportBetsCSV.js
```

**Output:** `bets_resultados.csv`

**Colunas:**
- `id` - ID da aposta
- `data_jogo` - Data do jogo (DD/MM/YYYY)
- `horario_jogo` - Horário do jogo (HH:MM)
- `home` - Time da casa
- `away` - Time visitante
- `placar` - Placar final (ex: 2-1)
- `mercado` - Mercado da aposta
- `pick` - Pick específico
- `odds` - Odds no momento do post
- `resultado` - success/failure/unknown
- `reason` - Motivo do resultado (da LLM)
- `postado` - sim/nao
- `data_postagem` - Data do post no Telegram
- `data_resultado` - Data da atualização do resultado
- `status_jogo` - Status do jogo na API

---

## 2. Taxa de Sucesso por Mercado

Mostra taxa de sucesso de cada mercado individual (granular).

```bash
node scripts/showSuccessRates.js
```

**Exemplo de output:**
```
║ MERCADO                                         │ 7 DIAS    │ 15 DIAS   │ 30 DIAS   │ TOTAL     ║
║ Aposte em mais de 0,5 gol no jogo               │ 75.0% 3/4 │ 80.0% 4/5 │ 80.0% 4/5 │ 80.0% 4/5 ║
```

---

## 3. Taxa de Sucesso por Categoria

Agrupa mercados em categorias (Gols, Escanteios, Cartões, BTTS, Outros).

```bash
node scripts/showSuccessRatesByCategory.js
```

**Categorias:**
- **Gols** - mercados com "gol" ou "goal"
- **Escanteios** - mercados com "escanteio" ou "corner"
- **Cartões** - mercados com "cartão", "cartao" ou "card"
- **BTTS** - mercados com "ambas", "btts", "marcam" ou "marcar"
- **Outros** - resto

**Exemplo de output:**
```
╔════════════════════════════════════════════════════════════════════════════════════════╗
║                        TAXA DE SUCESSO POR CATEGORIA                                   ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  CATEGORIA     │    7 DIAS       │   15 DIAS       │   30 DIAS       │    TOTAL       ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  Cartões       │  78.0% (32/41)  │  78.2% (61/78)  │  78.2% (61/78)  │  78.2% (61/78)  ║
║  Gols          │  63.0% (46/73)  │  67.6% (71/105) │  67.6% (71/105) │  67.6% (71/105) ║
```

---

## 4. Taxa de Sucesso por Liga + Categoria

Mostra uma tabela por campeonato, com breakdown por categoria.

```bash
node scripts/showSuccessRatesByLeague.js
```

**Exemplo de output:**
```
╔════════════════════════════════════════════════════════════════════════════════════════╗
║  Brazil - Brazil Paulista A1                                                         ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  CATEGORIA     │    7 DIAS       │   15 DIAS       │   30 DIAS       │    TOTAL       ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  Gols          │  50.0% (6/12)   │  56.3% (9/16)   │  56.3% (9/16)   │  56.3% (9/16)   ║
║  Cartões       │ 100.0% (8/8)    │  91.7% (11/12)  │  91.7% (11/12)  │  91.7% (11/12)  ║
```

---

## 5. Top/Bottom Pares Liga + Categoria

Mostra os 10 melhores e 10 piores pares de liga/categoria.

```bash
node scripts/showTopBottomPairs.js
```

**Filtro:** Mínimo de 3 apostas para entrar no ranking.

**Exemplo de output:**
```
╔════════════════════════════════════════════════════════════════════════════════════════╗
║                           🏆 TOP 10 - MELHORES PARES                               ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║  #  │ CAMPEONATO / CATEGORIA                              │   TAXA    │   BETS    ║
╠════════════════════════════════════════════════════════════════════════════════════════╣
║   1 │ Brazil - Brazil Paulista A1 | Cartões              │  91.7%    │   11/12   ║
║   2 │ Europe - Europe UEFA Champions League | Cartões    │  82.4%    │   14/17   ║
```

---

## Resumo Rápido

| Script | Comando | Descrição |
|--------|---------|-----------|
| `exportBetsCSV.js` | `node scripts/exportBetsCSV.js` | Exporta CSV completo |
| `showSuccessRates.js` | `node scripts/showSuccessRates.js` | Taxa por mercado individual |
| `showSuccessRatesByCategory.js` | `node scripts/showSuccessRatesByCategory.js` | Taxa por categoria |
| `showSuccessRatesByLeague.js` | `node scripts/showSuccessRatesByLeague.js` | Taxa por liga + categoria |
| `showTopBottomPairs.js` | `node scripts/showTopBottomPairs.js` | Top/Bottom 10 pares |

---

## Notas

- **Fórmula:** `Taxa = success / (success + failure) * 100`
- **Não conta:** pending, cancelled, unknown
- **Filtro de data:** Baseado em `kickoff_time` (data do jogo), não `result_updated_at`
- **Período:** 7, 15, 30 dias e total histórico
