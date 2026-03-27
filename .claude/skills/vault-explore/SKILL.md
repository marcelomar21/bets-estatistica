# Vault Explorer — Memoria do Projeto

Explora o vault Obsidian (Basic Memory MCP, projeto `guru`) de forma interativa.
Funciona como uma memoria viva do projeto — tudo que foi documentado sobre decisoes,
mudancas, arquitetura, fluxos, clientes e debug esta la.

## Quando usar

- Antes de implementar algo: verificar se ja existe documentacao relevante
- Para entender decisoes passadas (ADRs, Specs)
- Para ver o que mudou recentemente (Changelog)
- Para entender fluxos do sistema (Flows)
- Para consultar config de clientes (Clients)
- Para debug/operacoes (Runbooks)

## Estrutura do Vault

```
guru/
├── ADRs/              Decisoes arquiteturais (ADR-001 a ADR-004)
├── Archive/           Epics concluidos
├── Changelog/         Log de PRs mergeados (data + resumo + migrations)
├── Clients/           Config por cliente (Guru da Bet, Osmar Palpites, etc)
├── Database/
│   ├── Migrations/    Historico de migrations SQL
│   ├── Schema.md      Schema atual do banco
│   └── Queries.md     Queries uteis
├── Discovery/         Pesquisas e feedback de usuarios
├── Epics/             Epics ativos (E06 Multi-Bot Evolution)
├── Flows/             Fluxos do sistema (Posting, Distribution, Tracking, etc)
├── Project/
│   ├── Architecture.md    Arquitetura geral
│   ├── Codebase Patterns.md  Padroes de codigo
│   ├── Files Map.md       Mapa de arquivos
│   ├── Infrastructure.md  Infra (Render, Vercel, Supabase)
│   └── Tech Stack.md      Stack tecnologica
├── Runbooks/          Guias operacionais (Debug Telegram, Deploy)
├── Specs/             Especificacoes tecnicas
└── Templates/         Templates para novos docs
```

## Como explorar

Execute os passos abaixo na ordem. Adapte conforme o que o usuario pediu.

### 1. Entender o que o usuario quer

Pergunte ou infira: o usuario quer...
- Ver o que mudou recentemente? -> Changelog
- Entender como algo funciona? -> Flows ou Architecture
- Saber por que algo foi decidido? -> ADRs
- Debug de algo em producao? -> Runbooks
- Config de um cliente especifico? -> Clients
- Schema/migrations do banco? -> Database

### 2. Listar o conteudo relevante

Use `mcp__basic-memory__list_directory` com `project: "guru"` para navegar:

```
# Raiz do vault
list_directory(project="guru", depth=1)

# Subpasta especifica
list_directory(project="guru", dir_name="Changelog", depth=1)
```

### 3. Buscar por tema

Use `mcp__basic-memory__search_notes` para busca semantica:

```
# Busca por texto
search_notes(project="guru", query="posting timeout")

# Busca por tag
search_notes(project="guru", tags=["fix", "posting"])

# Busca recente
search_notes(project="guru", after_date="2026-03-20")
```

### 4. Ler conteudo de uma nota

Use `mcp__basic-memory__build_context` para carregar uma nota:

```
# Nota especifica
build_context(project="guru", url="Changelog/2026-03-27 PR #166", output_format="text")

# Todas as notas de uma pasta
build_context(project="guru", url="Flows/*", output_format="text")

# Com notas relacionadas
build_context(project="guru", url="Project/Architecture", depth=2, max_related=5)
```

### 5. Ver atividade recente

Use `mcp__basic-memory__recent_activity`:

```
# Ultima semana
recent_activity(project="guru", timeframe="7d")

# Ultimo mes
recent_activity(project="guru", timeframe="30d")
```

## Formato da resposta

Ao apresentar resultados, use este formato:

```
## Vault: [area explorada]

**Encontrei X notas relevantes:**

1. **[Titulo]** (pasta/arquivo) — resumo de 1 linha
2. **[Titulo]** (pasta/arquivo) — resumo de 1 linha

[Se o usuario quiser detalhes, carregar a nota com build_context]
```

## Regras

- Sempre use `project: "guru"` nas chamadas MCP
- Apresente resultados de forma concisa — nao despeje o conteudo inteiro de uma nota
- Se o usuario pedir algo vago, comece por `recent_activity` e `list_directory` raiz
- Se nao encontrar nada, diga — nao invente conteudo
- Lembre que o vault e atualizado apos cada PR mergeado (vault-sync)
