# Story 13.1: Atualizar Modelo de Dados com Campos de Elegibilidade

Status: review

## Story

As a desenvolvedor,
I want ter campos de elegibilidade na tabela suggested_bets,
so that possa gerenciar o ciclo de vida de postagem das apostas separadamente do ciclo de resultado.

## Acceptance Criteria

### AC1: Novos campos adicionados à tabela
**Given** tabela `suggested_bets` existente no Supabase
**When** executar migration de alteração
**Then** novos campos são adicionados:
  - `elegibilidade` (TEXT, default 'elegivel', CHECK IN ('elegivel', 'removida', 'expirada'))
  - `promovida_manual` (BOOLEAN, default false)
  - `historico_postagens` (JSONB, default '[]')

### AC2: Índice de performance criado
**Given** campo `elegibilidade` adicionado
**When** migration completa
**Then** índice `idx_suggested_bets_elegibilidade` existe na coluna elegibilidade

### AC3: Dados existentes preservados
**Given** apostas existentes na tabela
**When** migration executada
**Then** todas as apostas existentes têm `elegibilidade = 'elegivel'`
**And** todas têm `promovida_manual = false`
**And** todas têm `historico_postagens = '[]'`

### AC4: Validação de valores
**Given** campo elegibilidade existe
**When** tentar inserir valor inválido
**Then** constraint rejeita (apenas 'elegivel', 'removida', 'expirada' permitidos)

## Tasks / Subtasks

- [x] Task 1: Criar migration SQL (AC: 1, 2, 3, 4)
  - [x] Adicionar coluna `elegibilidade` com CHECK constraint
  - [x] Adicionar coluna `promovida_manual` com default false
  - [x] Adicionar coluna `historico_postagens` com default '[]'::jsonb
  - [x] Criar índice em `elegibilidade`
  - [x] Testar migration localmente se possível

- [x] Task 2: Executar migration no Supabase (AC: 1, 2, 3)
  - [x] Executar via SQL Editor no dashboard Supabase
  - [x] Verificar que colunas foram criadas
  - [x] Verificar que dados existentes foram preservados

- [x] Task 3: Atualizar TypeScript/JSDoc types se existirem (AC: 1)
  - [x] Verificar se há tipos definidos para suggested_bets
  - [x] Adicionar novos campos aos tipos (N/A - projeto usa JS puro sem tipos formais)

## Dev Notes

### Migration SQL Completa

```sql
-- Story 13.1: Adicionar campos de elegibilidade à tabela suggested_bets
-- Epic 13: Gestão de Elegibilidade de Apostas
-- Data: 2026-01-12

-- 1. Adicionar coluna elegibilidade
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS elegibilidade TEXT DEFAULT 'elegivel'
CHECK (elegibilidade IN ('elegivel', 'removida', 'expirada'));

-- 2. Adicionar coluna promovida_manual
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS promovida_manual BOOLEAN DEFAULT false;

-- 3. Adicionar coluna historico_postagens
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS historico_postagens JSONB DEFAULT '[]'::jsonb;

-- 4. Criar índice para performance de queries
CREATE INDEX IF NOT EXISTS idx_suggested_bets_elegibilidade
ON suggested_bets(elegibilidade);

-- 5. Verificar resultado
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'suggested_bets'
AND column_name IN ('elegibilidade', 'promovida_manual', 'historico_postagens');
```

### Modelo de Dados Atualizado

A tabela `suggested_bets` agora tem 3 ciclos de vida:

**Ciclo de Elegibilidade (NOVO):**
- `elegibilidade`: 'elegivel' | 'removida' | 'expirada'
- `promovida_manual`: true | false
- `historico_postagens`: array de timestamps

**Ciclo de Status (EXISTENTE):**
- `bet_status`: 'generated' | 'pending_link' | 'ready' | 'posted' | 'success' | 'failure' | 'cancelled'

**Relacionamento:**
- Uma aposta com `elegibilidade = 'elegivel'` pode entrar na seleção de postagem
- Uma aposta com `promovida_manual = true` ignora filtro de odds >= 1.60
- `historico_postagens` registra cada vez que foi postada (múltiplos jobs)

### Project Structure Notes

**Arquivos que NÃO precisam ser modificados nesta story:**
- `bot/services/betService.js` - será modificado na Story 13.5
- `bot/handlers/adminGroup.js` - será modificado nas Stories 13.2-13.4

**Localização da migration:**
- Executar diretamente no Supabase SQL Editor
- OU criar arquivo em `sql/migrations/` se padrão existir

### Architecture Compliance

**Padrões a seguir:**
- Naming: snake_case para colunas (project-context.md)
- JSONB para arrays (padrão PostgreSQL)
- CHECK constraints para enums (padrão existente na tabela)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#Ciclo de Vida da Aposta]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.1]
- [Source: _bmad-output/project-context.md#Naming Conventions]
- [Source: docs/data-models.md#suggested_bets]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Migration SQL criada seguindo padrão existente (001, 002 -> 003)
- Verificação de tipos: projeto usa JavaScript puro (CommonJS) sem tipos TypeScript/JSDoc formais

### Completion Notes List

- Migration SQL criada em `sql/migrations/003_add_eligibility_fields.sql`
- Migration executada com sucesso no Supabase pelo usuário
- Campos adicionados: `elegibilidade` (TEXT), `promovida_manual` (BOOLEAN), `historico_postagens` (JSONB)
- Índice `idx_suggested_bets_elegibilidade` criado para performance
- Dados existentes preservados com valores default: elegibilidade='elegivel', promovida_manual=false, historico_postagens='[]'
- Constraint CHECK valida apenas valores permitidos: 'elegivel', 'removida', 'expirada'
- Não há tipos TypeScript/JSDoc formais no projeto - Task 3 marcada como N/A

### File List

- `sql/migrations/003_add_eligibility_fields.sql` (novo)

### Change Log

- 2026-01-12: Criado arquivo de migration SQL com novos campos de elegibilidade
- 2026-01-12: Migration executada com sucesso no Supabase
