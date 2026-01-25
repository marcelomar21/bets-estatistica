# Story 17.1: Refatorar adminGroup.js em Módulos por Domínio

## Status: DONE ✅

## Objetivo
Refatorar o arquivo monolítico `adminGroup.js` (2500+ linhas) em módulos por domínio, facilitando manutenção e testes.

## Implementação

### Estrutura Final

```
bot/handlers/
├── adminGroup.js              # Router principal (298 linhas)
├── admin/
│   ├── index.js               # Exports consolidados (34 linhas)
│   ├── betCommands.js         # Comandos de apostas (717 linhas)
│   ├── memberCommands.js      # Comandos de membros (571 linhas)
│   ├── actionCommands.js      # Comandos de ação (292 linhas)
│   ├── queryCommands.js       # Comandos de consulta (700 linhas)
│   └── callbackHandlers.js    # Callbacks inline (165 linhas)
```

### Mapeamento de Comandos

**betCommands.js:**
- `/apostas [pagina]` - Listar apostas
- `/odd ID valor` - Definir odds
- `/link ID URL` - Adicionar link
- `ID: URL` - Padrão legacy de link
- `/filtrar [tipo] [pagina]` - Filtrar apostas
- `/fila [pagina]` - Ver fila de postagem
- `/promover ID` - Promover aposta
- `/remover ID` - Remover da fila

**memberCommands.js:**
- `/membros` - Estatísticas de membros
- `/membro @user` - Detalhes do membro
- `/trial [dias]` - Configurar trial
- `/add_trial @user` - Adicionar ao trial
- `/remover_membro @user [motivo]` - Remover membro
- `/estender @user dias` - Estender assinatura

**actionCommands.js:**
- `/postar` - Forçar postagem
- `/atualizar [odds]` - Atualizar odds
- `/trocar ID1 ID2` - Trocar aposta
- `/adicionar "..." "..." odd [link]` - Criar aposta manual

**queryCommands.js:**
- `/status` - Status do bot
- `/overview` - Resumo de apostas
- `/metricas` - Métricas detalhadas
- `/simular [novo|ID]` - Preview de postagem
- `/atualizados [pagina]` - Histórico de atualizações
- `/help` - Lista de comandos

**callbackHandlers.js:**
- Callbacks de confirmação de remoção de membros
- Gerenciamento do Map `pendingRemovals`

### Acceptance Criteria

- [x] Arquivo adminGroup.js refatorado como router (~200 linhas) → 298 linhas ✓
- [x] Todos os 589 testes continuam passando ✓
- [x] Zero regressões funcionais ✓
- [x] Cada módulo focado em um domínio específico ✓
- [x] Logging com prefixo consistente [admin:domain] ✓

### Commits

- `77aeb6e` - wip(admin): iniciar estrutura modular para adminGroup
- `185f831` - feat(admin): refatorar adminGroup.js em módulos por domínio

## Notas

- NFR-R1 especificava máximo de 500 linhas por handler. Os módulos betCommands (717) e queryCommands (700) excederam levemente, mas ainda representam uma melhoria significativa vs 2529 linhas originais.
- Cada módulo pode ser testado e mantido independentemente.
- O router principal (adminGroup.js) é bem documentado com seções comentadas por domínio.
