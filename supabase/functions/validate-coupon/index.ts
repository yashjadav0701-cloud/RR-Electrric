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
    // Uses the Service Role Key to safely check the database from the server
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { code } = await req.json()

    if (!code) throw new Error("Please enter a coupon code.")

    const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code.trim().toUpperCase())
        .eq('is_active', true)
        .single()

    if (error || !coupon) {
        throw new Error("Invalid coupon code.")
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        throw new Error("This coupon has expired.")
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        throw new Error("This coupon has reached its maximum usage limit.")
    }

    // Returns ONLY safe math variables to the browser, hiding database structure
    return new Response(JSON.stringify({ 
        valid: true,
        coupon: {
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_amount: coupon.discount_amount,
            min_cart_value: coupon.min_cart_value,
            max_discount: coupon.max_discount
        }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    
  } catch (error: any) {
    // Return 200 so the Supabase client doesn't throw a generic HTTP error, allowing it to read the specific message.
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
  }
})