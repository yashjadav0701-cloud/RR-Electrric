import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webPush from "https://esm.sh/web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { audience, notification } = await req.json();

        // 1. Initialize Supabase Admin Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Bypasses RLS to read secure tokens
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Configure VAPID Web Push Keys
        const VAPID_PUBLIC = 'BLD4-vOI6rWbwlHiJYYYJZB_lJkRwe_Au9zQVC3_FQzCCDaq-JmqZhDClcGa0O0pUTp5bQDewyUCbXKJ232I4fw';
        const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
        
        webPush.setVapidDetails(
            'mailto:rrelectrric@gmail.com',
            VAPID_PUBLIC,
            VAPID_PRIVATE
        );

        // 3. Determine the Audience (Who gets the message?)
        let targetSubscriptions = [];

        if (audience === 'abandoned_cart') {
            // Find users inactive for > 2 hours with items in their cart
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const { data } = await supabase
                .from('user_push_subscriptions')
                .select('*')
                .lt('last_active', twoHoursAgo);
            
            // Filter out empty carts safely
            targetSubscriptions = (data || []).filter(sub => {
                try {
                    const cart = typeof sub.cart_data === 'string' ? JSON.parse(sub.cart_data) : sub.cart_data;
                    return Array.isArray(cart) && cart.length > 0;
                } catch (e) { return false; }
            });

        } else if (audience === 'all') {
            // Marketing Broadcasts to everyone
            const { data } = await supabase.from('user_push_subscriptions').select('*');
            targetSubscriptions = data || [];
        } else if (Array.isArray(audience)) {
            // Targeted specific endpoints (e.g. for Order Status Updates)
            const { data } = await supabase.from('user_push_subscriptions').select('*').in('endpoint', audience);
            targetSubscriptions = data || [];
        }

        if (targetSubscriptions.length === 0) {
            return new Response(JSON.stringify({ success: true, message: "No target audience found.", sent: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 4. Fire the Notifications & Handle Dead Tokens
        const deadEndpoints: string[] = [];
        let successCount = 0;

        const pushPromises = targetSubscriptions.map(async (sub) => {
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: { auth: sub.auth_key, p256dh: sub.p256dh_key }
            };

            try {
                await webPush.sendNotification(pushConfig, JSON.stringify(notification));
                successCount++;
            } catch (error: any) {
                // HTTP 410 Gone or 404 Not Found means the user revoked permissions or uninstalled the PWA
                if (error.statusCode === 410 || error.statusCode === 404) {
                    deadEndpoints.push(sub.endpoint);
                } else {
                    console.error('Push error for endpoint:', sub.endpoint, error);
                }
            }
        });

        await Promise.all(pushPromises);

        // 5. Database Cleanup (Self-healing database)
        if (deadEndpoints.length > 0) {
            await supabase.from('user_push_subscriptions').delete().in('endpoint', deadEndpoints);
            console.log(`Cleaned up ${deadEndpoints.length} dead tokens.`);
        }

        return new Response(JSON.stringify({ 
            success: true, 
            sent: successCount, 
            cleaned: deadEndpoints.length 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Transmission Engine Error:', error.message);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});