import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signPayload(payloadJson: string, timestamp: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${timestamp}.${payloadJson}`),
  );
  return base64Url(new Uint8Array(signature));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const signingSecret = Deno.env.get("INVOICE_SHARED_SECRET") ?? "";
    const gasUrl = Deno.env.get("INVOICE_STUDIO_WEB_APP_URL") ||
      "https://script.google.com/macros/s/AKfycbwtqsx4naszPK6Q8nQrdq3eMOMMl3K_JVfQkSs5cKAyO4e-gt-RFxYxhIlCwyR-O9O6Tg/exec";
    const authorization = request.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("The invoice service is not configured with Supabase credentials.");
    if (signingSecret.length < 32) throw new Error("INVOICE_SHARED_SECRET must be configured with at least 32 characters.");
    if (!authorization.startsWith("Bearer ")) return json({ error: "Your admin session is missing. Sign in again." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Your admin session has expired. Sign in again." }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: role, error: roleError } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (roleError) throw roleError;
    if (!role) return json({ error: "Only RR ELECTRRIC administrators can use Invoice Studio." }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    if (action !== "catalog" && action !== "save") return json({ error: "Choose a valid Invoice Studio operation." }, 400);

    let apiPayload: Record<string, unknown> = {
      version: 1,
      source: "INVOICE_STUDIO_API",
      action,
    };
    if (action === "save") {
      if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        return json({ error: "Invoice data is missing." }, 400);
      }
      apiPayload.invoice = body.payload;
    }

    const payloadJson = JSON.stringify(apiPayload);
    if (payloadJson.length > 250000) return json({ error: "The invoice request is too large." }, 413);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signPayload(payloadJson, timestamp, signingSecret);

    let gasResponse: Response;
    try {
      gasResponse = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioApi: { payloadJson, timestamp, signature } }),
        redirect: "follow",
      });
    } catch (error) {
      console.error("Apps Script request failed:", error);
      return json({ error: "Invoice Studio could not reach the Google Sheets invoice service. Check the Apps Script deployment and try again." }, 502);
    }

    const responseText = await gasResponse.text();
    let gasResult: any;
    try { gasResult = JSON.parse(responseText); }
    catch {
      console.error("Unexpected Apps Script response:", responseText.slice(0, 500));
      return json({ error: "Google Apps Script returned an unexpected response. Verify that the latest Web App version is deployed." }, 502);
    }
    if (!gasResponse.ok || !gasResult || gasResult.status !== "success") {
      return json({ error: gasResult?.message || `Google Apps Script returned HTTP ${gasResponse.status}.` }, 400);
    }
    if (!gasResult.result) return json({ error: "Google Apps Script did not return invoice data." }, 502);

    return json({ status: "success", result: gasResult.result });
  } catch (error) {
    console.error("invoice-studio error:", error);
    return json({ error: error instanceof Error ? error.message : "Invoice Studio could not complete the request." }, 400);
  }
});
