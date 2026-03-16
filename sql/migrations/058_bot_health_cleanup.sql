-- Remove orphan bot_health entries with NULL group_id
-- These cause "Bot do grupo Desconhecido está offline" notifications
DELETE FROM bot_health WHERE group_id IS NULL;
