-- Preserve the customer's original cart line order for future invoices.
-- Existing rows remain NULL because their original display order cannot be reconstructed reliably.
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS line_number smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.order_items'::regclass
          AND conname = 'order_items_line_number_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_line_number_check
            CHECK (line_number IS NULL OR line_number BETWEEN 1 AND 50);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_line_number_unique
    ON public.order_items (order_id, line_number)
    WHERE line_number IS NOT NULL;

COMMENT ON COLUMN public.order_items.line_number IS
    'Original position in the submitted cart; NULL on historical rows created before this migration.';
