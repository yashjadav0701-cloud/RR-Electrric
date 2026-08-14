import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight for the browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase with the SERVICE_ROLE key to bypass RLS and perform secure admin math
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { customer, cart, couponCode, idempotencyKey } = await req.json()

    if (!cart || cart.length === 0) {
      throw new Error("Cart is empty.")
    }

    // 1. SECURE PRICING: Fetch trustworthy product data directly from the database
    const cartIds = cart.map((item: any) => item.id)
    const { data: dbProducts, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .in('id', cartIds)
        
    if (prodErr) throw prodErr

    let sellingSubtotal = 0;
    const finalOrderItems = [];

    // 2. VERIFY CART & SMART VARIANTS SECURELY
    for (const item of cart) {
      const dbProd = dbProducts.find((p: any) => p.id === item.id)
      if (!dbProd || !dbProd.is_active) throw new Error(`One or more products in your bag are unavailable.`)

      const isPack = item.isPack && item.packQty > 1 && item.packPrice;
      let unitPrice = dbProd.selling_price;
      
      if (isPack) {
         const tiers = dbProd.bulk_packs || [];
         const validTier = tiers.find((t: any) => t.qty === item.packQty);
         if (validTier) {
             unitPrice = validTier.price;
         } else if (dbProd.pack_qty === item.packQty) {
             unitPrice = dbProd.pack_price; // Legacy fallback
         } else {
             throw new Error("Invalid bulk pack pricing detected.");
         }
      }

      sellingSubtotal += unitPrice * item.qty;
      
      finalOrderItems.push({
        product_id: dbProd.id,
        product_name_snapshot: dbProd.name,
        quantity: item.qty,
        unit_price_snapshot: unitPrice,
        total_price: unitPrice * item.qty,
        is_pack: item.isPack || false,
        pack_qty: isPack ? item.packQty : null,
        selected_options: item.selectedOptions || null
      })
    }

    // 3. SERVER-SIDE VIP ENGINE: Calculate exact discount securely
    let vipDiscount = 0;
    const { data: vipTiers } = await supabase
        .from('vip_tiers')
        .select('*')
        .eq('is_active', true)
        .order('min_spend', { ascending: false })
    
    if (vipTiers && vipTiers.length > 0) {
        const validVip = vipTiers.find((v: any) => sellingSubtotal >= v.min_spend);
        if (validVip) {
            vipDiscount = (sellingSubtotal * validVip.discount_percentage) / 100;
        }
    }

    // 4. SERVER-SIDE COUPON ENGINE: Verify and calculate securely
    let couponDiscount = 0;
    let couponId = null;
    if (couponCode) {
        const { data: coupon } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', couponCode.toUpperCase())
            .eq('is_active', true)
            .single()
            
        if (coupon) {
            const now = new Date();
            const expiry = coupon.expires_at ? new Date(coupon.expires_at) : null;
            const notExpired = !expiry || now < expiry;
            const belowLimit = !coupon.usage_limit || (coupon.used_count || 0) < coupon.usage_limit;
            
            if (notExpired && belowLimit && sellingSubtotal >= (coupon.min_cart_value || 0)) {
                couponId = coupon.id;
                if (coupon.discount_type === 'PERCENTAGE') {
                    couponDiscount = (sellingSubtotal * coupon.discount_amount) / 100;
                    if (coupon.max_discount && couponDiscount > coupon.max_discount) {
                        couponDiscount = coupon.max_discount;
                    }
                } else {
                    couponDiscount = coupon.discount_amount;
                    if (couponDiscount > sellingSubtotal) {
                        couponDiscount = sellingSubtotal;
                    }
                }
            }
        }
    }

    // 5. SECURE DELIVERY CALCULATION
    const { data: configData } = await supabase
        .from('store_configurations')
        .select('config_value')
        .eq('config_key', 'delivery_settings')
        .single()
        
    const deliverySettings = configData?.config_value || {};
    const minOrder = parseFloat(deliverySettings.min_order) || 0;
    const freeAbove = parseFloat(deliverySettings.free_above) || 0;
    const baseCharge = parseFloat(deliverySettings.charge) || 0;

    const discountedSubtotal = Math.max(0, sellingSubtotal - vipDiscount - couponDiscount);
    
    if (discountedSubtotal > 0 && discountedSubtotal < minOrder) {
        throw new Error(`Minimum order of ₹${minOrder} not reached.`);
    }
    
    const deliveryCharge = (discountedSubtotal >= freeAbove && freeAbove > 0) ? 0 : baseCharge;
    const finalTotal = discountedSubtotal + deliveryCharge;

    // 6. UPSERT CUSTOMER (Create new or update existing by Phone number)
    const { data: custData, error: custErr } = await supabase
        .from('customers')
        .upsert({
            phone: customer.phone,
            name: customer.name,
            address: customer.address,
            area: customer.area,
            landmark: customer.landmark
        }, { onConflict: 'phone' })
        .select()
        .single()
        
    if (custErr) throw custErr;
    const customerId = custData.id;

    // 7. CREATE ORDER RECORD
    const orderRef = 'RR-' + Math.floor(100000 + Math.random() * 900000); // e.g. RR-839201
    const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({
            order_reference: orderRef,
            customer_id: customerId,
            coupon_id: couponId,
            status: 'pending',
            vip_discount: vipDiscount,
            coupon_discount: couponDiscount,
            delivery_charge: deliveryCharge,
            final_total: finalTotal,
            notes: customer.note || null
        })
        .select()
        .single()
        
    if (orderErr) throw orderErr;

    // 8. INSERT ALL ORDER ITEMS
    const itemsToInsert = finalOrderItems.map(item => ({
        order_id: orderData.id,
        ...item
    }))
    const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert)
    if (itemsErr) throw itemsErr;

    // 9. INCREMENT COUPON USAGE (If applied)
    if (couponId) {
        const { data: cData } = await supabase.from('coupons').select('used_count').eq('id', couponId).single()
        await supabase.from('coupons').update({ used_count: (cData?.used_count || 0) + 1 }).eq('id', couponId)
    }

    // 10. SEND SUCCESS RESPONSE BACK TO APP.JS
    return new Response(
        JSON.stringify({ order_reference: orderRef, final_total: finalTotal }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
        JSON.stringify({ error: err.message }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})