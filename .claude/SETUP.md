# Setup do ambiente Claude Code

## Pre-requisitos

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) instalado (`npm install -g @anthropic-ai/claude-code`)
- Node.js 18+
- Git

## O que ja vem no repo

Os arquivos `.claude/` trackeados incluem:

- `settings.json` — config do projeto (hooks, env vars)
- `hooks/` — scripts AgentVibes (TTS) e BMAD
- `commands/` — slash commands (AgentVibes + BMAD workflows)
- `personalities/` — estilos de voz TTS
- `config/` — config de audio/efeitos

## AgentVibes (TTS) — opcional

Os hooks de TTS fazem o Claude "falar" durante o trabalho. Sem instalar, os hooks falham silenciosamente (nao quebra nada).

### Instalar no macOS

```bash
# 1. Instalar AgentVibes via npm
npx agentvibes install

# 2. O instalador vai detectar macOS e usar as vozes nativas (say)
# Nenhuma dependencia extra necessaria no Mac
```

### Instalar no Linux/WSL

```bash
# 1. Instalar AgentVibes
npx agentvibes install

# 2. Instalar Piper TTS (voz offline)
bash .claude/hooks/piper-installer.sh

# 3. Dependencias de audio (se necessario)
sudo apt install ffmpeg sox
```

### Verificar instalacao

```bash
# Testar se TTS funciona
bash .claude/hooks/play-tts.sh "Hello world"
```

### Mutar/desmutar

Se nao quiser TTS, basta mutar:

```
/agent-vibes:mute
```

Para desmutar:

```
/agent-vibes:unmute
```

## BMAD (Build Measure Analyze Decide) — opcional

Os workflows BMAD estao nos slash commands (`/bmad:*`). Funcionam direto sem instalacao extra — sao apenas arquivos `.md` com prompts.

Exemplos:
- `/bmad:bmm:workflows:create-story` — criar story a partir dos epics
- `/bmad:bmm:workflows:dev-story` — implementar uma story
- `/bmad:bmm:workflows:code-review` — code review adversarial
- `/bmad:bmm:workflows:sprint-status` — ver status do sprint

## CLAUDE.md global

O arquivo `~/.claude/CLAUDE.md` (global, por maquina) contem regras que se aplicam a todos os projetos. Crie o seu com:

```bash
cat > ~/.claude/CLAUDE.md << 'EOF'
# Global Rules

## Git Flow (OBRIGATORIO)

### Branches
- **NUNCA** commitar diretamente na `main` ou `master`
- **SEMPRE** criar uma branch antes de implementar qualquer coisa:
  - Features: `feature/<descricao-curta>`
  - Bug fixes: `fix/<descricao-curta>`
  - Refactoring: `refactor/<descricao-curta>`
  - Chores/config: `chore/<descricao-curta>`

### Commits
- Usar conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`

### Pull Requests
- **SEMPRE** criar um PR para mergear na main/master
- **NUNCA** criar o PR sem validar com o usuario a descricao e o conteudo

## Swarms / Teams (RECOMENDADO)
- Avaliar se a tarefa se beneficia de execucao paralela com multiplos agentes
- Preferir swarms para 3+ subtarefas independentes

## Qualidade de Codigo (OBRIGATORIO)
- **NAO seja preguicoso** — investigar causa raiz antes de propor solucao
- Codigo de producao: limpo, robusto, testavel e mantivel
- Sem TODOs, hacks temporarios ou solucoes "por enquanto"
EOF
```
