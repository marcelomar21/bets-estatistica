# Bets Estatística - Documentação

> Sistema de análise estatística de apostas esportivas com IA

## Visão Geral do Projeto

| Atributo | Valor |
|----------|-------|
| **Tipo** | Monolith (Backend + Data Pipeline) |
| **Linguagem** | JavaScript (Node.js 20+) |
| **Arquitetura** | Pipeline ETL + AI Agent |
| **Banco de Dados** | PostgreSQL |
| **IA** | LangChain + OpenAI |

## Referência Rápida

### Stack Tecnológico

| Tecnologia | Uso |
|------------|-----|
| Node.js 20+ | Runtime |
| LangChain 1.1.x | Framework IA |
| OpenAI GPT-5 | Modelo de linguagem |
| PostgreSQL | Armazenamento |
| Puppeteer | Geração de PDF |
| Zod | Validação de schemas |
| Axios | Cliente HTTP |

### Entry Point Principal

```bash
node main.js  # Pipeline completo
```

### Comandos Frequentes

```bash
node scripts/check_analysis_queue.js --dry-run  # Ver fila
node scripts/daily_update.js                     # Atualizar dados
node agent/analysis/runAnalysis.js today         # Analisar jogos
node agent/persistence/main.js <match_id>        # Persistir análise
```

## Documentação Gerada

### Arquitetura e Design

- [Visão Geral do Projeto](./project-overview.md) - Resumo executivo e propósito
- [Arquitetura do Sistema](./architecture.md) - Componentes e fluxos
- [Análise da Árvore de Código](./source-tree-analysis.md) - Estrutura de diretórios

### Dados e Modelos

- [Modelos de Dados](./data-models.md) - Schema PostgreSQL completo

### Desenvolvimento

- [Guia de Desenvolvimento](./development-guide.md) - Setup, comandos e troubleshooting

## Documentação Existente

- [README do Agente](../README_agent.md) - Documentação original do módulo de IA
- [TODO](../TODO.md) - Lista de tarefas pendentes

## Começando

### Para Desenvolvedores

1. Leia o [Guia de Desenvolvimento](./development-guide.md) para setup
2. Entenda a [Arquitetura](./architecture.md) do sistema
3. Explore os [Modelos de Dados](./data-models.md) para entender o banco

### Para Entender o Código

1. Comece pela [Árvore de Código](./source-tree-analysis.md)
2. Veja os entry points em `main.js` e `scripts/`
3. Explore `agent/analysis/runAnalysis.js` para a lógica IA

### Para Modificar/Estender

1. Novos dados: Adicione scripts em `scripts/` seguindo padrão fetch/load
2. Nova lógica IA: Modifique `agent/analysis/prompt.js` e `schema.js`
3. Novos relatórios: Estenda `agent/persistence/htmlRenderer.js`

## Desenvolvimento Assistido por IA

Ao usar assistentes de IA para desenvolver neste projeto:

1. **Forneça contexto:** Referencie este `index.md` como ponto de partida
2. **Para features de dados:** Use [data-models.md](./data-models.md)
3. **Para features de IA:** Use [architecture.md](./architecture.md) seção AI Processing
4. **Para novos scripts:** Use [source-tree-analysis.md](./source-tree-analysis.md)

## Estrutura de Pastas

```
bets-estatistica/
├── agent/           # Agente IA e persistência
│   ├── analysis/    # LangChain, prompts, schemas
│   ├── persistence/ # Markdown, HTML, PDF
│   └── shared/      # Utilitários
├── scripts/         # ETL (fetch/load)
├── sql/             # Schemas do banco
├── data/            # Saídas geradas (gitignored)
└── docs/            # Esta documentação
```

---

**Gerado em:** 2026-01-10  
**Workflow:** BMM document-project  
**Modo:** Deep Scan
