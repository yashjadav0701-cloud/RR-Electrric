-- Migration 003: Add Delivery Charge to Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(10,2) DEFAULT 0 CHECK (delivery_charge >= 0);

-- Safely patch the existing delivery_settings configuration to include the new numeric fields
-- This ensures the admin panel and edge function have fallback values immediately.
UPDATE store_configurations
SET config_value = config_value || '{"charge": 40, "free_above": 499, "min_order": 149}'::jsonb
WHERE config_key = 'delivery_settings' AND NOT config_value ? 'charge';