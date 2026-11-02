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

function readDefaultKey(jsonEnvName: string): string {
  const raw = Deno.env.get(jsonEnvName) ?? "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.default === "string") return parsed.default;
      const first = Object.values(parsed).find(value => typeof value === "string");
      return typeof first === "string" ? first : "";
    }
  } catch {
    // Ignore malformed optional key maps; legacy and singular variables are checked next.
  }
  return "";
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

function getGasUrl(): string {
  const value = Deno.env.get("INVOICE_STUDIO_WEB_APP_URL") ||
    "https://script.google.com/macros/s/AKfycbwtqsx4naszPK6Q8nQrdq3eMOMMl3K_JVfQkSs5cKAyO4e-gt-RFxYxhIlCwyR-O9O6Tg/exec";
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("INVOICE_STUDIO_WEB_APP_URL is not a valid URL."); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || !parsed.pathname.endsWith("/exec")) {
    throw new Error("INVOICE_STUDIO_WEB_APP_URL must be the HTTPS Google Apps Script Web App /exec URL.");
  }
  return parsed.toString();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // New Supabase projects expose key maps; retain legacy names for older projects.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || readDefaultKey("SUPABASE_PUBLISHABLE_KEYS");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SECRET_KEY") || readDefaultKey("SUPABASE_SECRET_KEYS");
    const signingSecret = Deno.env.get("INVOICE_SHARED_SECRET") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Invoice Studio configuration missing Supabase URL or publishable/secret API key.");
      return json({ error: "Invoice Studio is missing Supabase server configuration. Check the Edge Function environment keys." }, 500);
    }
    if (signingSecret.length < 32) {
      return json({ error: "INVOICE_SHARED_SECRET is missing or shorter than 32 characters in Supabase Edge Function secrets." }, 500);
    }
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Your admin session is missing. Sign in again." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Your admin session has expired. Sign in again." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: role, error: roleError } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (roleError) {
      console.error("Invoice Studio admin-role lookup failed:", roleError.message);
      return json({ error: "Your sign-in worked, but the administrator role could not be verified. Check the user_roles table and Supabase secret API key." }, 500);
    }
    if (!role) return json({ error: "Your sign-in worked, but this account is not assigned the RR ELECTRRIC admin role." }, 403);

    let body: any;
    try { body = await request.json(); }
    catch { return json({ error: "Invoice Studio received an invalid request body." }, 400); }

    const action = String(body?.action ?? "");
    if (action !== "catalog" && action !== "save") {
      return json({ error: "Choose a valid Invoice Studio operation." }, 400);
    }

    const apiPayload: Record<string, unknown> = {
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
    const gasUrl = getGasUrl();

    let gasResponse: Response;
    try {
      // Google Apps Script ContentService intentionally redirects its response to
      // a one-time script.googleusercontent.com URL. Follow redirects to read JSON.
      gasResponse = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", "Accept": "application/json" },
        body: JSON.stringify({ studioApi: { payloadJson, timestamp, signature } }),
        redirect: "follow",
        cache: "no-store",
      });
    } catch (error) {
      console.error("Apps Script request failed:", error);
      return json({
        error: "Invoice Studio could not reach the Google Apps Script Web App. Check that the deployed /exec URL is correct and publicly reachable.",
        diagnostic: { stage: "apps_script_fetch", reason: error instanceof Error ? error.message : String(error) },
      }, 502);
    }

    const responseText = await gasResponse.text();
    const contentType = gasResponse.headers.get("content-type") || "unknown";
    const finalHost = (() => {
      try { return new URL(gasResponse.url || gasUrl).hostname; }
      catch { return "unknown"; }
    })();

    let gasResult: any;
    try {
      gasResult = JSON.parse(responseText);
    } catch {
      console.error("Apps Script returned a non-JSON response:", {
        status: gasResponse.status,
        contentType,
        finalHost,
        redirected: gasResponse.redirected,
        responseStart: responseText.slice(0, 250),
      });
      return json({
        error: "Google Apps Script returned a web page instead of its JSON API response. This usually means the Web App URL is wrong, access is not set to Anyone, or the V4 Apps Script code has not been deployed as a new version.",
        diagnostic: {
          stage: "apps_script_response",
          httpStatus: gasResponse.status,
          contentType,
          finalHost,
          redirected: gasResponse.redirected,
        },
      }, 502);
    }

    if (!gasResponse.ok) {
      console.error("Apps Script HTTP error:", { status: gasResponse.status, buildId: gasResult?.buildId });
      return json({
        error: gasResult?.message || `Google Apps Script returned HTTP ${gasResponse.status}.`,
        diagnostic: { stage: "apps_script_http", httpStatus: gasResponse.status, buildId: gasResult?.buildId || null },
      }, 502);
    }

    if (!gasResult || gasResult.status !== "success") {
      const message = gasResult?.message || (gasResult?.status === "ignored"
        ? "The deployed Apps Script version does not recognize the Invoice Studio API request. Deploy the supplied V4 Code.gs as a new Web App version."
        : "Google Apps Script rejected the Invoice Studio API request.");
      console.error("Apps Script rejected Invoice Studio API:", {
        status: gasResult?.status || "missing",
        buildId: gasResult?.buildId || null,
        message,
      });
      return json({
        error: message,
        diagnostic: { stage: "apps_script_application", buildId: gasResult?.buildId || null, apiStatus: gasResult?.status || null },
      }, 502);
    }

    if (!gasResult.result) {
      console.error("Apps Script success response omitted result:", { buildId: gasResult.buildId || null });
      return json({
        error: "Google Apps Script accepted the request but returned no result. Verify the deployed V4 Code.gs and Apps Script execution log.",
        diagnostic: { stage: "apps_script_result", buildId: gasResult.buildId || null },
      }, 502);
    }

    return json({ status: "success", result: gasResult.result, buildId: gasResult.buildId || null });
  } catch (error) {
    console.error("invoice-studio internal error:", error);
    return json({ error: error instanceof Error ? error.message : "Invoice Studio could not complete the request." }, 500);
  }
});
