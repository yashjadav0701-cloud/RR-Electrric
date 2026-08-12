-- 1. Helper Function: Check if the current authenticated user is an Admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Enable Row Level Security (RLS) on all tables
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Public Read-Only Policies (For the Customer Frontend)
-- Customers can see categories
CREATE POLICY "Allow public read-only access to categories"
ON categories FOR SELECT USING (true);

-- Customers can see only ACTIVE products
CREATE POLICY "Allow public read-only access to active products"
ON products FOR SELECT USING (is_active = true);

-- Customers can see store configurations (name, whatsapp, delivery)
CREATE POLICY "Allow public read-only access to store configurations"
ON store_configurations FOR SELECT USING (true);

-- NOTE: Public has NO access to `coupons`, `orders`, `order_items`, `customers`, or `vip_tiers`. 
-- Edge Functions will handle secure interactions with these tables using the service_role key.

-- 4. Admin Full Access Policies
CREATE POLICY "Allow admin full access to categories" ON categories FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to products" ON products FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to store_configurations" ON store_configurations FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to vip_tiers" ON vip_tiers FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to coupons" ON coupons FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to customers" ON customers FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to orders" ON orders FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to order_items" ON order_items FOR ALL USING (is_admin());
CREATE POLICY "Allow admin full access to user_roles" ON user_roles FOR ALL USING (is_admin());

-- 5. Storage Security for Product Images
-- Create the bucket securely if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public can view images
CREATE POLICY "Allow public read to product-images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-images');

-- Admin can upload/edit/delete images
CREATE POLICY "Allow admin full access to product-images" 
ON storage.objects FOR ALL 
USING (bucket_id = 'product-images' AND is_admin());