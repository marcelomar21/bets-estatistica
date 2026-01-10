# Bets Estatística - Visão Geral do Projeto

## Resumo Executivo

O **Bets Estatística** é um sistema de análise estatística de apostas esportivas focado em futebol. O sistema utiliza inteligência artificial (LangChain + OpenAI) para gerar análises estruturadas de partidas, combinando dados de APIs externas de estatísticas de futebol com processamento via agentes IA para produzir recomendações de apostas seguras e oportunidades de valor.

## Propósito

Automatizar o processo de análise de partidas de futebol para:
1. Coletar e manter dados atualizados de ligas, times, jogadores e partidas
2. Gerar análises estruturadas via IA com recomendações de apostas
3. Produzir relatórios em múltiplos formatos (Markdown, HTML, PDF)
4. Persistir análises e recomendações em banco de dados PostgreSQL

## Tipo de Projeto

| Característica | Valor |
|----------------|-------|
| **Tipo** | Backend + Data Pipeline |
| **Linguagem** | JavaScript (Node.js 20+) |
| **Arquitetura** | Pipeline ETL + AI Agent |
| **Banco de Dados** | PostgreSQL (Supabase) |
| **IA** | LangChain + OpenAI (GPT-5) |

## Stack Tecnológico

| Categoria | Tecnologia | Versão |
|-----------|------------|--------|
| Runtime | Node.js | 20+ |
| AI Framework | LangChain | 1.1.x |
| LLM Provider | OpenAI | gpt-5.1-2025-11-13 |
| Database | PostgreSQL | via pg 8.x |
| HTTP Client | Axios | 1.13.x |
| PDF Generation | Puppeteer | 24.x |
| Schema Validation | Zod | 4.x |
| Config | dotenv | 17.x |

## Componentes Principais

### 1. Scripts ETL (`scripts/`)
- Fetch e load de dados de APIs externas (FootyStats)
- Sincronização de ligas, temporadas, times, jogadores e partidas
- Atualização diária automatizada via fila de análise

### 2. Agente de Análise (`agent/analysis/`)
- Agente IA baseado em LangChain
- Tools especializadas para consultas SQL (match_detail_raw, team_lastx_raw)
- Geração de análises estruturadas (overview, safe_bets, value_bets)

### 3. Persistência (`agent/persistence/`)
- Geração de Markdown a partir de análises JSON
- Renderização HTML e geração de PDF via Puppeteer
- Inserção de resultados em tabelas game_analysis e suggested_bets

### 4. Orquestração (`main.js`)
- Pipeline completo automatizado
- Gerenciamento de fila (match_analysis_queue)
- Retentativas automáticas e verificação de status

## Fluxo de Dados

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  API Externa    │────▶│  Scripts ETL     │────▶│  PostgreSQL     │
│  (FootyStats)   │     │  (fetch/load)    │     │  (dados brutos) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │  Agente IA       │◀─────────────┘
                        │  (LangChain)     │
                        └────────┬─────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  JSON           │     │  Markdown        │     │  HTML/PDF       │
│  Intermediário  │     │  Final           │     │  Relatórios     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Documentação Relacionada

- [Arquitetura](./architecture.md) - Arquitetura detalhada do sistema
- [Modelos de Dados](./data-models.md) - Schema do banco de dados
- [Guia de Desenvolvimento](./development-guide.md) - Como configurar e executar
- [Árvore de Código](./source-tree-analysis.md) - Estrutura de diretórios

---
*Documentação gerada em 2026-01-10 via BMM document-project workflow*
