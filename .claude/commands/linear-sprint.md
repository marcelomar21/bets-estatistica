Consultar o projeto Guru Bet no Linear, mostrar issues abertas, e ajudar a escolher qual executar.

## Processo

### 1. Carregar issues do Linear

Usar o MCP do Linear (team: "Guru") para buscar issues por status:

```
mcp__claude_ai_Linear__list_issues(team="Guru", state="started", limit=10)   # In Progress
mcp__claude_ai_Linear__list_issues(team="Guru", state="unstarted", limit=10) # Todo
mcp__claude_ai_Linear__list_issues(team="Guru", state="backlog", limit=20)   # Backlog
```

### 2. Apresentar painel resumido

Mostrar em formato limpo, agrupado por status:

```
## Linear — Guru Bet

### Em Progresso (X)
| ID | Titulo | Prioridade |
|...

### Todo (X)
| ID | Titulo | Prioridade |
|...

### Backlog (X)
| ID | Titulo | Prioridade |
|...

Qual issue quer pegar? (ID ou numero)
```

Regras de apresentacao:
- IDs SEMPRE com link clicavel: `[GURU-18](https://linear.app/aijourney/issue/GURU-18/...)` — usar o campo `url` da issue
- Titulo truncado em 60 chars, prioridade
- Ordenar por prioridade (Urgent > High > Normal > Low)
- Se prioridade for Urgent, marcar com **URGENTE**
- Nao mostrar issues arquivadas (archivedAt != null)

### 3. Aguardar escolha do usuario

Quando o usuario escolher uma issue:

1. Buscar detalhes completos: `mcp__claude_ai_Linear__get_issue(id="GURU-XX", includeRelations=true)`
2. Apresentar descricao completa + criterios de aceite
3. Perguntar: "Quer que eu comece a implementar?"

### 4. Iniciar implementacao

Se o usuario confirmar:

1. Mover issue para "In Progress": `mcp__claude_ai_Linear__save_issue(id="GURU-XX", stateId=<in_progress_state_id>)`
2. Criar branch usando o `gitBranchName` da issue
3. Usar o vault (Basic Memory) para contexto: `/vault-explore` se precisar entender fluxos
4. Implementar seguindo as regras do CLAUDE.md (branch, testes, E2E, PR)

### 5. Ao finalizar

1. Criar PR linkando a issue: incluir `Closes GURU-XX` no body do PR
2. Mover issue para "Done": `mcp__claude_ai_Linear__save_issue(id="GURU-XX", stateId=<done_state_id>)`

## Atalhos

Se o usuario passar um ID direto (ex: `/linear-sprint GURU-28`):
- Pular para o passo 3 (buscar detalhes e perguntar se quer implementar)

Se o usuario disser "fechar GURU-XX" ou "done GURU-XX":
- Mover a issue para Done sem implementar (ex: ja foi corrigido em outro PR)
