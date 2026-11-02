-- Preserve the customer details supplied with each order.
-- Existing orders are deliberately left NULL: the current customer row may have
-- changed since those orders were placed, so it is not a reliable historical snapshot.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_snapshot jsonb;

COMMENT ON COLUMN public.orders.customer_snapshot IS
    'Immutable customer name, phone and address captured when the order was placed. Older orders may be NULL.';
