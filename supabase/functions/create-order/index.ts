import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight for browser requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client with the admin SERVICE ROLE key
        // This securely bypasses RLS to write to the protected Orders table
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const body = await req.json();
        const { customer, cart, couponCode, idempotencyKey } = body;

        // 1. Basic Validation
        if (!cart || !Array.isArray(cart) || cart.length === 0) throw new Error("Cart is empty");
        if (!customer || !customer.phone || !customer.name || !customer.address || !customer.area) {
            throw new Error("Incomplete customer details");
        }

        // 2. Idempotency Check (Prevent duplicate orders on double-taps)
        if (idempotencyKey) {
            const { data: existingOrder } = await supabase
                .from('orders')
                .select('id, order_reference')
                .like('notes', `%IdempotencyKey: ${idempotencyKey}%`)
                .limit(1)
                .single();
                
            if (existingOrder) {
                // If it already exists, return success immediately without charging/creating again
                return new Response(JSON.stringify({ 
                    success: true, 
                    order_id: existingOrder.id,
                    order_reference: existingOrder.order_reference 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }
        }

        // 3. Fetch Products and validate prices securely from the database
        const productIds = cart.map((item: any) => item.id);
        const { data: dbProducts, error: prodErr } = await supabase
            .from('products')
            .select('*')
            .in('id', productIds)
            .eq('is_active', true);

        if (prodErr || !dbProducts) throw new Error("Failed to validate products securely");

        let subtotal = 0;
        const validOrderItems: any[] = [];

        for (const item of cart) {
            const dbProd = dbProducts.find(p => p.id === item.id);
            if (!dbProd) throw new Error(`One or more products are unavailable. Please refresh your cart.`);
            if (item.qty <= 0) throw new Error("Invalid cart quantity detected");

            const itemTotal = dbProd.selling_price * item.qty;
            subtotal += itemTotal;

            // Generate the secure snapshot for historical accuracy
            validOrderItems.push({
                product_id: dbProd.id,
                product_name_snapshot: dbProd.name,
                unit_price_snapshot: dbProd.selling_price,
                quantity: item.qty,
                total_price: itemTotal
            });
        }

        // 4. Server-Side VIP Logic Calculation
        let vipDiscount = 0;
        const { data: vipTiers } = await supabase
            .from('vip_tiers')
            .select('*')
            .eq('is_active', true)
            .order('min_spend', { ascending: false });

        if (vipTiers && vipTiers.length > 0) {
            const applicableVip = vipTiers.find(v => subtotal >= v.min_spend);
            if (applicableVip) {
                vipDiscount = (subtotal * applicableVip.discount_percentage) / 100;
            }
        }

        // 5. Server-Side Coupon Validation
        let couponDiscount = 0;
        let appliedCouponId = null;

        if (couponCode) {
            const { data: coupon } = await supabase
                .from('coupons')
                .select('*')
                .eq('code', couponCode.toUpperCase())
                .eq('is_active', true)
                .single();

            if (coupon) {
                const now = new Date();
                const expired = coupon.expires_at ? new Date(coupon.expires_at) < now : false;
                const limitReached = coupon.usage_limit ? coupon.used_count >= coupon.usage_limit : false;
                const meetsMinCart = subtotal >= (coupon.min_cart_value || 0);

                if (!expired && !limitReached && meetsMinCart) {
                    appliedCouponId = coupon.id;
                    if (coupon.discount_type === 'PERCENTAGE') {
                        couponDiscount = (subtotal * coupon.discount_amount) / 100;
                        if (coupon.max_discount && couponDiscount > coupon.max_discount) {
                            couponDiscount = coupon.max_discount;
                        }
                    } else {
                        couponDiscount = coupon.discount_amount;
                        if (couponDiscount > subtotal) couponDiscount = subtotal; // Cannot discount below 0
                    }
                }
            }
        }

        // 6. Final Calculation
        let finalTotal = subtotal - vipDiscount - couponDiscount;
        if (finalTotal < 0) finalTotal = 0;

        // 7. Customer Management (Upsert based on phone number to prevent duplicates)
        let customerId;
        const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', customer.phone)
            .single();

        if (existingCustomer) {
            customerId = existingCustomer.id;
            // Update their latest address details
            await supabase.from('customers').update({
                name: customer.name,
                address: customer.address,
                area: customer.area,
                landmark: customer.landmark
            }).eq('id', customerId);
        } else {
            const { data: newCustomer, error: custErr } = await supabase
                .from('customers')
                .insert({
                    name: customer.name,
                    phone: customer.phone,
                    address: customer.address,
                    area: customer.area,
                    landmark: customer.landmark
                }).select('id').single();
                
            if (custErr) throw new Error("Failed to record customer details securely");
            customerId = newCustomer.id;
        }

        // 8. Order Reference Generation (Format: RR-YYYYMMDD-XXXX)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const orderRef = `RR-${dateStr}-${randomStr}`;

        // 9. Create Main Order Row
        const noteText = customer.note ? `${customer.note}\n\nIdempotencyKey: ${idempotencyKey}` : `IdempotencyKey: ${idempotencyKey}`;
        
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .insert({
                order_reference: orderRef,
                customer_id: customerId,
                subtotal: subtotal,
                vip_discount: vipDiscount,
                coupon_id: appliedCouponId,
                coupon_discount: couponDiscount,
                final_total: finalTotal,
                status: 'pending',
                notes: noteText
            }).select('id, order_reference').single();

        if (orderErr || !order) throw new Error("Database refused order creation.");

        // 10. Insert Historical Order Items (Snapshots)
        const itemsToInsert = validOrderItems.map(item => ({ ...item, order_id: order.id }));
        const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
        if (itemsErr) throw new Error("Failed to write order line items securely.");

        // 11. Increment Coupon Usage Tracker
        if (appliedCouponId) {
            const { data: cData } = await supabase.from('coupons').select('used_count').eq('id', appliedCouponId).single();
            if (cData) {
                await supabase.from('coupons').update({ used_count: cData.used_count + 1 }).eq('id', appliedCouponId);
            }
        }

        // 12. Return Verified Success Payload to Browser
        return new Response(
            JSON.stringify({
                success: true,
                order_id: order.id,
                order_reference: order.order_reference,
                final_total: finalTotal
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message || "An unknown secure processing error occurred" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});