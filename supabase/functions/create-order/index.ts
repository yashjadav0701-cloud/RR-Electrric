import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { customer, cart, couponCode, idempotencyKey } = await req.json()

    if (!cart || cart.length === 0) throw new Error("Cart is empty.")
    
    // Generate order reference
    const date = new Date()
    const yyyymmdd = date.getFullYear().toString() + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0')
    const orderRef = `RR-${yyyymmdd}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // 1. Fetch Cart Products Securely
    const productIds = cart.map((c: any) => c.id)
    const { data: products, error: pErr } = await supabase.from('products').select('*').in('id', productIds)
    if (pErr || !products) throw new Error("Failed to fetch products")

    let subtotal = 0;
    const orderItems = [];

    for (const cartItem of cart) {
        const product = products.find((p: any) => p.id === cartItem.id)
        if (!product || !product.is_active) {
            throw new Error(`Product unavailable or inactive.`)
        }
        const totalItemPrice = product.selling_price * cartItem.qty;
        subtotal += totalItemPrice;
        
        orderItems.push({
            product_id: product.id,
            product_name_snapshot: product.name,
            unit_price_snapshot: product.selling_price,
            quantity: cartItem.qty,
            total_price: totalItemPrice
        });
    }

    // 2. Process VIP Discount
    const { data: vipTiers } = await supabase.from('vip_tiers').select('*').eq('is_active', true).order('min_spend', { ascending: false })
    let vipDiscount = 0;
    if (vipTiers) {
        const applicableVip = vipTiers.find((v: any) => subtotal >= v.min_spend);
        if (applicableVip) {
            vipDiscount = (subtotal * applicableVip.discount_percentage) / 100;
        }
    }

    // 3. Process Coupon Securely on Server
    let couponDiscount = 0;
    let couponId = null;

    if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode.trim().toUpperCase()).eq('is_active', true).single()
        
        if (coupon) {
            const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
            const limitReached = coupon.usage_limit && coupon.used_count >= coupon.usage_limit;
            const meetsMinCart = subtotal >= (coupon.min_cart_value || 0);

            if (!isExpired && !limitReached && meetsMinCart) {
                couponId = coupon.id;
                if (coupon.discount_type === 'PERCENTAGE') {
                    couponDiscount = (subtotal * coupon.discount_amount) / 100;
                    if (coupon.max_discount && couponDiscount > coupon.max_discount) {
                        couponDiscount = coupon.max_discount;
                    }
                } else {
                    couponDiscount = coupon.discount_amount;
                    if (couponDiscount > subtotal) couponDiscount = subtotal;
                }
            } else {
                throw new Error("Coupon is invalid, expired, or criteria not met.")
            }
        } else {
            throw new Error("Invalid coupon code.")
        }
    }

    const discountedSubtotal = Math.max(0, subtotal - vipDiscount - couponDiscount);

    // --- 3.5 Process Secure Delivery & Minimum Order ---
    const { data: configData } = await supabase.from('store_configurations').select('config_value').eq('config_key', 'delivery_settings').single();
    const deliveryConfig = configData?.config_value || {};
    
    const minOrder = parseFloat(deliveryConfig.min_order) || 0;
    const freeAbove = parseFloat(deliveryConfig.free_above) || 0;
    const baseCharge = parseFloat(deliveryConfig.charge) || 0;

    if (discountedSubtotal < minOrder && minOrder > 0) {
        throw new Error(`Minimum order of ₹${minOrder} not reached. Add ₹${(minOrder - discountedSubtotal).toFixed(2)} more to place this order.`);
    }

    let deliveryCharge = baseCharge;
    if (freeAbove > 0 && discountedSubtotal >= freeAbove) {
        deliveryCharge = 0;
    }

    const finalTotal = discountedSubtotal + deliveryCharge;

    // 4. Save Customer
    let customerId;
    const { data: existingCustomer } = await supabase.from('customers').select('id').eq('phone', customer.phone).single()
    
    if (existingCustomer) {
        const { data: updatedCust, error: custErr } = await supabase.from('customers')
            .update({ name: customer.name, address: customer.address, area: customer.area, landmark: customer.landmark })
            .eq('id', existingCustomer.id)
            .select('id').single()
        if (custErr) throw custErr;
        customerId = updatedCust.id;
    } else {
        const { data: newCust, error: custErr } = await supabase.from('customers')
            .insert([{ name: customer.name, phone: customer.phone, address: customer.address, area: customer.area, landmark: customer.landmark }])
            .select('id').single()
        if (custErr) throw custErr;
        customerId = newCust.id;
    }

    // 5. Create Order
    const { data: insertedOrder, error: orderErr } = await supabase.from('orders').insert([{
        order_reference: orderRef,
        customer_id: customerId,
        subtotal: subtotal,
        vip_discount: vipDiscount,
        coupon_id: couponId,
        coupon_discount: couponDiscount,
        final_total: finalTotal,
        notes: customer.note || null
    }]).select('id').single()

    if (orderErr || !insertedOrder) throw new Error("Failed to create order record")

    // 6. Create Order Items
    const itemsToInsert = orderItems.map(item => ({
        order_id: insertedOrder.id,
        ...item
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert)
    if (itemsErr) throw itemsErr;

    // 7. Increment Coupon usage
    if (couponId) {
        const { data: currentCoupon } = await supabase.from('coupons').select('used_count').eq('id', couponId).single()
        if (currentCoupon) {
            await supabase.from('coupons').update({ used_count: currentCoupon.used_count + 1 }).eq('id', couponId)
        }
    }

    return new Response(JSON.stringify({ order_reference: orderRef }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    
  } catch (error: any) {
    // Return 200 so the Supabase client doesn't throw a generic HTTP error, allowing it to read the specific message.
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
  }
})