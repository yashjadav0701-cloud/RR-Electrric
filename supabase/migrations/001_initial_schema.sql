-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Generic trigger function to auto-update 'updated_at' columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Admin Roles (Links to Supabase auth.users)
CREATE TABLE user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Store Configurations
CREATE TABLE store_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(50) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_store_configurations_modtime
    BEFORE UPDATE ON store_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    description TEXT,
    selling_price NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0),
    mrp_price NUMERIC(10,2) CHECK (mrp_price >= 0 AND mrp_price >= selling_price),
    is_active BOOLEAN DEFAULT true,
    keywords TEXT,
    image_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_products_modtime
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. VIP Tiers
CREATE TABLE vip_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    discount_percentage NUMERIC(5,2) NOT NULL CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    min_spend NUMERIC(10,2) NOT NULL CHECK (min_spend >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Coupons
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('FIXED', 'PERCENTAGE')),
    discount_amount NUMERIC(10,2) NOT NULL CHECK (discount_amount >= 0),
    min_cart_value NUMERIC(10,2) DEFAULT 0 CHECK (min_cart_value >= 0),
    max_discount NUMERIC(10,2) CHECK (max_discount >= 0),
    usage_limit INTEGER CHECK (usage_limit > 0),
    used_count INTEGER DEFAULT 0 CHECK (used_count >= 0),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Customers (Lightweight table for reliable business history independent of browser storage)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    area VARCHAR(100) NOT NULL,
    landmark VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference VARCHAR(30) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    vip_discount NUMERIC(10,2) DEFAULT 0 CHECK (vip_discount >= 0),
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    coupon_discount NUMERIC(10,2) DEFAULT 0 CHECK (coupon_discount >= 0),
    final_total NUMERIC(10,2) NOT NULL CHECK (final_total >= 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_orders_modtime
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Order Items (Includes price/name snapshots to protect historical data)
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(200) NOT NULL,
    unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Indexes for Performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_customers_phone ON customers(phone);

-- 13. Seed Categories
INSERT INTO categories (name) VALUES 
('Lighting'), ('LED Bulbs'), ('LED Tubelights'), ('LED Panels'), 
('LED Battens'), ('LED Downlights'), ('LED Spotlights'), ('LED Flood Lights'), 
('LED Street Lights'), ('LED Strip Lights'), ('Decorative Lights'), 
('Emergency Lights'), ('Night Lamps'), ('Ceiling Lights'), ('Wall Lights'), 
('Outdoor Lights'), ('Industrial Lights'), ('Bulb Holders'), ('Lamp Holders'), 
('Switches & Sockets'), ('Switches'), ('Modular Switches'), ('Sockets'), 
('Modular Sockets'), ('Switch Boards'), ('Plates'), ('Fan Regulators'), 
('Dimmers'), ('Bell Pushes'), ('USB Sockets'), ('Extension Boards'), 
('Plug Tops'), ('Adapters'), ('Wires & Cables'), ('House Wires'), 
('Flexible Wires'), ('Electrical Cables'), ('Coaxial Cables'), 
('Data Cables'), ('Speaker Cables'), ('CCTV Cables'), ('Cable Accessories'), 
('Fans'), ('Ceiling Fans'), ('Exhaust Fans'), ('Table Fans'), ('Wall Fans'), 
('Pedestal Fans'), ('Ventilation Fans'), ('Fan Capacitors'), ('Fan Accessories'), 
('Protection & Distribution'), ('MCB'), ('RCCB'), ('RCBO'), ('ELCB'), 
('Isolators'), ('Distribution Boards'), ('MCB Boxes'), ('Fuse'), 
('Fuse Holders'), ('Surge Protectors'), ('Changeover Switches'), 
('Contactors'), ('Relays'), ('Electrical Accessories'), ('Electrical Tape'), 
('Cable Ties'), ('Connectors'), ('Terminal Blocks'), ('Lugs'), 
('Cable Glands'), ('Junction Boxes'), ('Conduit'), ('Conduit Accessories'), 
('Clips'), ('Saddles'), ('Heat Shrink'), ('Electrical Enclosures'), 
('Home Electrical'), ('Door Bells'), ('Calling Bells'), ('Extension Cords'), 
('Multi Plugs'), ('Voltage Stabilizers'), ('Timers'), ('Sensors'), 
('Motion Sensors'), ('Smart Plugs'), ('Smart Switches'), ('Appliances'), 
('Geysers'), ('Water Heaters'), ('Exhaust Appliances'), ('Room Heaters'), 
('Electric Kettles'), ('Irons'), ('Small Electrical Appliances'), ('Tools'), 
('Testers'), ('Multimeters'), ('Pliers'), ('Screwdrivers'), ('Wire Strippers'), 
('Cutters'), ('Crimping Tools'), ('Electrical Tool Kits'), ('Batteries & Power'), 
('Batteries'), ('Rechargeable Batteries'), ('Battery Chargers'), ('Inverters'), 
('UPS'), ('Power Supplies');

-- 14. Seed Default Configurations
INSERT INTO store_configurations (config_key, config_value) VALUES 
('store_info', '{"name": "RR ELECTRRIC", "whatsapp": ""}'::jsonb),
('delivery_settings', '{"area": "Nadiad", "min_time": "10 minutes", "max_time": "2 days"}'::jsonb),
('homepage_settings', '{"featured_categories": ["LED Bulbs", "Modular Switches", "House Wires"]}'::jsonb);