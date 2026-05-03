# Deploy Review — Analisa, revisa e mergeia cards em Ready to Deploy

Recebe um card ID (ex: GURU-45) ou "next" pra pegar o próximo da fila.

## Fluxo

1. **Encontrar o card**: buscar no Linear, verificar status Ready to Deploy ou In Review
2. **Encontrar o PR**: buscar PRs abertos associados ao card
3. **Análise geral**: ler o diff, verificar arquivos, CI status, conflitos com master
4. **Se tem PR com conflitos**: fechar PR antigo, criar branch limpa, cherry-pick ou reimplementar, novo PR
5. **Se PR limpo**: verificar testes + build localmente
6. **Adversarial review**: rodar a skill `bmad-review-adversarial-general` no código — encontrar pelo menos 10 issues
7. **Classificar findings**: separar em CRITICAL (bloqueia merge), MEDIUM (corrigir se possível), LOW (tech debt)
8. **Corrigir findings CRITICAL e MEDIUM**: aplicar fixes no código
9. **Commit fixes**: push com commit descrevendo os findings corrigidos
10. **Criar tech debt cards**: para cada finding LOW ou MEDIUM não corrigido, criar um card no Linear do Guru (team 898904d1-8bf7-400b-990f-d91d08068cd3) com:
    - Título: `[Tech Debt] <componente>: <descrição curta>`
    - Priority: baseada na severidade (2=High, 3=Normal, 4=Low)
    - Descrição com: Problema, Impacto, Fix sugerido, Arquivos afetados, Origem (PR + finding number)
11. **Comentar no PR**: postar tabela completa de findings — quais foram corrigidos e quais viraram tech debt cards
12. **Mergear**: `gh pr merge --squash --delete-branch --admin`
13. **Atualizar Linear**: mover card pra Done
14. **Sync local**: `git checkout master && git pull`

## Argumentos

$ARGUMENTS = card ID (ex: GURU-45) ou "next"

Se "next", pegar o primeiro card em Ready to Deploy pela ordem de prioridade do dashboard.
