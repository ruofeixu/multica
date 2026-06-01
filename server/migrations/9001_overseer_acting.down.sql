DROP TABLE IF EXISTS overseer_action_log;
DROP TABLE IF EXISTS overseer_acting_token;
ALTER TABLE overseer DROP COLUMN IF EXISTS acting_enabled;
