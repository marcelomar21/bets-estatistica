Auditar o vault Obsidian (Basic Memory MCP, projeto "guru") contra o estado real do codebase. Encontrar defasagens, corrigir o que tiver certeza, e perguntar sobre o que nao tiver.

## Processo

### Fase 1 — Inventario

1. Listar todo o vault: `list_directory(project="guru", depth=3)`
2. Categorizar as notas por area:
   - `Project/` — Architecture, Codebase Patterns, Files Map, Infrastructure, Tech Stack
   - `Database/` — Schema, Migrations, Queries
   - `Flows/` — Distribution, Posting, Tracking, Manual Post, Member Lifecycle
   - `Clients/` — Config por cliente
   - `Runbooks/` — Guias operacionais
   - `Changelog/` — Historico de PRs (so verificar se os ultimos PRs estao la)

### Fase 2 — Cross-check por area

Para cada area, comparar o vault contra a realidade. Usar agentes em paralelo quando possivel.

#### Project/Architecture.md
- Ler a nota via `build_context`
- Comparar contra `bot/server.js`, `admin-panel/src/app/api/`, estrutura de pastas real
- Verificar: rotas listadas existem? Servicos mencionados existem? Fluxo descrito bate?

#### Project/Tech Stack.md
- Comparar versoes listadas contra `package.json` (bot e admin-panel)
- Verificar modelos LLM contra `lib/config.js`

#### Project/Infrastructure.md
- Verificar services do Render listados contra API do Render (se acessivel)
- Verificar URLs do Supabase contra `.env.local`

#### Project/Files Map.md
- Comparar arvore de arquivos documentada contra `ls` real
- Arquivos que sumiram? Arquivos novos nao documentados?

#### Database/Schema.md
- Comparar tabelas/colunas listadas contra o schema real (query via Supabase Management API ou `information_schema`)
- Verificar se migrations recentes estao refletidas

#### Flows/*.md
- Para cada fluxo, verificar se os arquivos/funcoes referenciados existem
- Verificar se o fluxo descrito ainda bate com o codigo

#### Clients/*.md
- Verificar group_ids, bot_usernames, chat_ids contra banco (`groups`, `bot_pool`)
- Verificar se todos os grupos ativos tem nota de cliente

#### Runbooks/*.md
- Verificar se comandos/URLs listados ainda funcionam
- Verificar se service IDs do Render batem

### Fase 3 — Classificar achados

Separar em 3 categorias:

**Auto-fix (tenho certeza):**
- Versao desatualizada no Tech Stack (package.json e a fonte da verdade)
- Arquivo que sumiu do Files Map
- Migration nova que falta no Schema
- Modelo LLM desatualizado

**Perguntar ao usuario:**
- Fluxo que parece ter mudado mas nao tenho certeza se e intencional
- Cliente que nao tem nota mas tem grupo ativo
- Runbook com comando que pode estar desatualizado
- Qualquer mudanca arquitetural significativa

**Ignorar:**
- Diferencas cosmeticas (formatacao, ordem de itens)
- Changelog incompleto (so adicionar o que falta, nao reclamar)

### Fase 4 — Executar

1. Apresentar um resumo dos achados antes de fazer qualquer coisa
2. Aplicar auto-fixes via `edit_note` ou `write_note` do basic-memory MCP
3. Para cada item "perguntar", apresentar a defasagem e aguardar resposta
4. Ao final, apresentar um relatorio:

```
## Vault Audit Report

### Auto-corrigido
- [x] Tech Stack: Node.js 20 -> 22
- [x] Files Map: adicionado bot/services/newService.js
- [x] Schema: adicionada tabela X (migration 060)

### Requer atencao
- [ ] Flow Posting menciona `confirmationService.js` que nao existe mais — remover referencia?
- [ ] Cliente "Novo Tips" tem grupo ativo mas nao tem nota em Clients/

### Vault atualizado
X notas editadas, Y notas criadas, Z perguntas pendentes
```

## Regras

- Sempre usar `project: "guru"` nas chamadas MCP
- Nunca deletar notas sem perguntar — so editar ou criar
- Preferir editar notas existentes a criar novas
- Ser conciso nas edicoes — nao reescrever notas inteiras, so atualizar o que mudou
- O codigo e a fonte da verdade, nao o vault. Se divergem, o vault esta errado.
