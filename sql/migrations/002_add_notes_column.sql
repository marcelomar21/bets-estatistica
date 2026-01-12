-- Migration: 002_add_notes_column.sql
-- Description: Adiciona coluna notes para histórico de alterações manuais
-- Story: 12-1 - Corrigir bug coluna notes
-- Date: 2026-01-12

-- Adiciona coluna notes na tabela suggested_bets
-- Usada para armazenar histórico de alterações manuais (odds, status, etc)
ALTER TABLE suggested_bets 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Comentário descritivo da coluna
COMMENT ON COLUMN suggested_bets.notes IS 'Notas sobre alterações manuais (odds ajustadas, status alterado, criação manual, etc)';
