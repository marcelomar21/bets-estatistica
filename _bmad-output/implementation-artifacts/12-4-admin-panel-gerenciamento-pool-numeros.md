# Story 12.4: Admin Panel — Gerenciamento do Pool de Números

Status: done

## Story

As a super admin,
I want gerenciar o pool global de números via admin panel,
So that eu possa adicionar, visualizar e gerenciar números sem acesso direto ao banco.

## Acceptance Criteria

1. **Given** super admin acessa a página de pool de números no admin panel
   **When** a página carrega
   **Then** tabela exibe todos os números com status, grupo alocado e último heartbeat
   **And** badge visual indica o status de cada número

2. **Given** super admin quer adicionar um novo número
   **When** clica em "Adicionar Número" e insere o telefone
   **Then** número é adicionado ao pool com status `connecting`

3. **Given** super admin quer ver detalhes de um número
   **When** clica no número na tabela
   **Then** visualiza status, grupo atual e métricas de saúde

## Tasks

- [ ] Task 1: Type definitions in database.ts
- [ ] Task 2: API route GET/POST /api/whatsapp-pool
- [ ] Task 3: WhatsApp number utils (status badges)
- [ ] Task 4: Pool page with table, form, and summary
- [ ] Task 5: Sidebar navigation entry
- [ ] Task 6: Validation (tests + build)
