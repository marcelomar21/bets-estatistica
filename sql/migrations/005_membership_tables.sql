-- Story 16.1: Criar Infraestrutura de Membros e State Machine
-- Tabelas para gerenciar ciclo de vida de membros do grupo Telegram
-- Integração com Cakto para pagamentos e assinaturas

-- ============================================
-- TABELA: members
-- ============================================
-- Armazena dados de membros do grupo, incluindo status de assinatura,
-- informações de trial e integração com Cakto

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido')),
  cakto_subscription_id TEXT,
  cakto_customer_id TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('pix', 'boleto', 'cartao_recorrente')),
  last_payment_at TIMESTAMPTZ,
  kicked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Comentarios da tabela members
COMMENT ON TABLE members IS 'Membros do grupo Telegram com status de assinatura e integracao Cakto';
COMMENT ON COLUMN members.id IS 'ID interno do membro';
COMMENT ON COLUMN members.telegram_id IS 'ID unico do usuario no Telegram';
COMMENT ON COLUMN members.telegram_username IS 'Username do Telegram (sem @)';
COMMENT ON COLUMN members.email IS 'Email do membro para contato e integracao Cakto';
COMMENT ON COLUMN members.status IS 'Estado atual: trial, ativo, inadimplente, removido';
COMMENT ON COLUMN members.cakto_subscription_id IS 'ID da assinatura no Cakto';
COMMENT ON COLUMN members.cakto_customer_id IS 'ID do cliente no Cakto';
COMMENT ON COLUMN members.trial_started_at IS 'Data de inicio do trial';
COMMENT ON COLUMN members.trial_ends_at IS 'Data de termino do trial (trial_started_at + 7 dias)';
COMMENT ON COLUMN members.subscription_started_at IS 'Data de inicio da assinatura paga';
COMMENT ON COLUMN members.subscription_ends_at IS 'Data de termino da assinatura atual';
COMMENT ON COLUMN members.payment_method IS 'Metodo de pagamento: pix, boleto, cartao_recorrente';
COMMENT ON COLUMN members.last_payment_at IS 'Data do ultimo pagamento confirmado';
COMMENT ON COLUMN members.kicked_at IS 'Data em que foi removido do grupo (se aplicavel)';
COMMENT ON COLUMN members.notes IS 'Notas internas (cortesias, observacoes, etc)';
COMMENT ON COLUMN members.created_at IS 'Data de criacao do registro';
COMMENT ON COLUMN members.updated_at IS 'Data da ultima atualizacao do registro';

-- ============================================
-- TABELA: member_notifications
-- ============================================
-- Historico de notificacoes enviadas aos membros (lembretes, boas-vindas, etc)

CREATE TABLE IF NOT EXISTS member_notifications (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('trial_reminder', 'renewal_reminder', 'welcome', 'farewell', 'payment_received')),
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'email')),
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  message_id TEXT
);

-- Comentarios da tabela member_notifications
COMMENT ON TABLE member_notifications IS 'Historico de notificacoes enviadas aos membros';
COMMENT ON COLUMN member_notifications.id IS 'ID da notificacao';
COMMENT ON COLUMN member_notifications.member_id IS 'FK para members - membro que recebeu a notificacao';
COMMENT ON COLUMN member_notifications.type IS 'Tipo: trial_reminder, renewal_reminder, welcome, farewell, payment_received';
COMMENT ON COLUMN member_notifications.channel IS 'Canal de envio: telegram ou email';
COMMENT ON COLUMN member_notifications.sent_at IS 'Data/hora do envio';
COMMENT ON COLUMN member_notifications.message_id IS 'ID da mensagem no Telegram (para referencia)';

-- ============================================
-- TABELA: webhook_events
-- ============================================
-- Event sourcing para webhooks do Cakto - armazena eventos raw
-- para processamento assincrono com idempotencia

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ
);

-- Comentarios da tabela webhook_events
COMMENT ON TABLE webhook_events IS 'Event sourcing para webhooks do Cakto - processamento assincrono';
COMMENT ON COLUMN webhook_events.id IS 'ID do evento';
COMMENT ON COLUMN webhook_events.idempotency_key IS 'Chave unica para garantir idempotencia (event_id do Cakto)';
COMMENT ON COLUMN webhook_events.event_type IS 'Tipo do evento: purchase_approved, subscription_renewed, etc';
COMMENT ON COLUMN webhook_events.payload IS 'Payload completo do webhook em JSON';
COMMENT ON COLUMN webhook_events.status IS 'Status: pending, processing, completed, failed';
COMMENT ON COLUMN webhook_events.attempts IS 'Numero de tentativas de processamento';
COMMENT ON COLUMN webhook_events.max_attempts IS 'Limite maximo de tentativas (default: 5)';
COMMENT ON COLUMN webhook_events.last_error IS 'Ultimo erro de processamento (se houver)';
COMMENT ON COLUMN webhook_events.created_at IS 'Data/hora de recebimento do webhook';
COMMENT ON COLUMN webhook_events.processed_at IS 'Data/hora de conclusao do processamento';

-- ============================================
-- INDICES PARA PERFORMANCE
-- ============================================

-- members: busca por telegram_id (mais frequente)
CREATE INDEX IF NOT EXISTS idx_members_telegram_id
ON members(telegram_id);

-- members: busca por status (para queries de listagem)
CREATE INDEX IF NOT EXISTS idx_members_status
ON members(status);

-- members: trials expirando (para job kick-expired)
CREATE INDEX IF NOT EXISTS idx_members_trial_ends
ON members(trial_ends_at)
WHERE status = 'trial';

-- members: assinaturas expirando (para job renewal-reminders)
CREATE INDEX IF NOT EXISTS idx_members_subscription_ends
ON members(subscription_ends_at)
WHERE status = 'ativo';

-- members: busca por subscription_id (para reconciliação com Cakto - Story 16.8)
CREATE INDEX IF NOT EXISTS idx_members_cakto_subscription
ON members(cakto_subscription_id)
WHERE cakto_subscription_id IS NOT NULL;

-- member_notifications: busca por membro
CREATE INDEX IF NOT EXISTS idx_notifications_member
ON member_notifications(member_id);

-- member_notifications: verificar se ja enviou notificacao hoje (evita duplicatas)
CREATE INDEX IF NOT EXISTS idx_notifications_type_date
ON member_notifications(member_id, type, sent_at DESC);

-- webhook_events: busca por status (para job process-webhooks)
CREATE INDEX IF NOT EXISTS idx_webhook_status
ON webhook_events(status);

-- webhook_events: eventos pendentes ordenados por data (para processamento FIFO)
CREATE INDEX IF NOT EXISTS idx_webhook_pending
ON webhook_events(status, created_at)
WHERE status = 'pending';

-- ============================================
-- TRIGGER PARA updated_at AUTOMATICO
-- ============================================

-- Funcao para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela members
DROP TRIGGER IF EXISTS trigger_members_updated_at ON members;
CREATE TRIGGER trigger_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
