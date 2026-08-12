import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { action, platform, productId } = await req.json();

        if (platform !== 'amazon') {
            throw new Error("Only Amazon marketplace is supported.");
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache'
        };

        if (action === 'refresh') {
            let price = 0;
            let available = true;

            const res = await fetch(`https://www.amazon.in/dp/${productId}`, { headers });
            const html = await res.text();
            
            const priceMatch = html.match(/<span class="a-price-whole">([\d,]+)/) || html.match(/<span id="priceblock_ourprice"[^>]*>₹?([\d,]+)/);
            if (priceMatch && priceMatch[1]) {
                price = parseFloat(priceMatch[1].replace(/,/g, ''));
            } else if (html.includes('Currently unavailable') || html.includes('out of stock')) {
                available = false;
            }

            // FIXED: Added 'Content-Type': 'application/json' so the browser parses it automatically
            return new Response(JSON.stringify({ success: true, price, available }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
                status: 200 
            });
        }

        return new Response(JSON.stringify({ success: false, error: 'Invalid action' }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
        });
    }
});