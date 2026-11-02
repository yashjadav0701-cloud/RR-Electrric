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

function money(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`The order contains an invalid ${field}.`);
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function localDateISO(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("The order date is invalid.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signPayload(payloadJson: string, timestamp: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payloadJson}`),
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
    const authorization = request.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("The invoice service is not configured with Supabase credentials.");
    }
    if (signingSecret.length < 32) {
      throw new Error("INVOICE_SHARED_SECRET must be configured with at least 32 characters.");
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
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) return json({ error: "Only RR ELECTRRIC administrators can prepare invoices." }, 403);

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
      return json({ error: "A valid order ID is required." }, 400);
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("*, customers(*), coupons(code)")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "The order could not be found." }, 404);
    if (order.status !== "accepted") {
      return json({ error: "Only accepted orders can be prepared for invoicing." }, 409);
    }

    // Keep the original cart row order for new orders. Older rows have NULL line_number;
    // created_at + id provide deterministic display order without pretending to know the old cart sequence.
    const { data: orderItems, error: orderItemsError } = await adminClient
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("line_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (orderItemsError) throw orderItemsError;
    if (!Array.isArray(orderItems) || orderItems.length < 1 || orderItems.length > 50) {
      return json({ error: "The order must contain between 1 and 50 product lines." }, 409);
    }

    const items = orderItems.map((item: Record<string, unknown>, index: number) => {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
        throw new Error(`Product line ${index + 1} has an invalid quantity.`);
      }
      const unitPrice = money(item.unit_price_snapshot, `unit price on product line ${index + 1}`);
      const lineTotal = money(item.total_price, `line total on product line ${index + 1}`);
      if (Math.abs(lineTotal - unitPrice * quantity) > 0.02) {
        throw new Error(`Product line ${index + 1} does not reconcile with its saved price snapshot.`);
      }
      const isPack = item.is_pack === true && Number(item.pack_qty) > 1;
      const packQty = isPack ? Number(item.pack_qty) : 1;
      if (isPack && (!Number.isInteger(packQty) || packQty < 2 || packQty > 9999)) {
        throw new Error(`Product line ${index + 1} has an invalid pack quantity.`);
      }
      const unitMrp = money(item.mrp_price_snapshot ?? item.unit_price_snapshot, `MRP on product line ${index + 1}`);
      const selectedOptions = String(item.selected_options ?? "").trim().slice(0, 250);
      let productName = String(item.product_name_snapshot ?? "").trim();
      if (!productName) throw new Error(`Product line ${index + 1} has no saved product name.`);
      if (isPack) productName += ` (Pack of ${packQty})`;
      if (selectedOptions) productName += ` — ${selectedOptions}`;
      return {
        productName,
        quantity,
        priceSnapshot: unitPrice,
        mrpSnapshot: Math.round(unitMrp * packQty * 100) / 100,
        warrantySnapshot: String(item.warranty_snapshot ?? "").trim(),
        isPack,
        packQty: isPack ? packQty : null,
      };
    });

    const subtotal = money(order.subtotal, "order subtotal");
    const lineSubtotal = Math.round(items.reduce((sum: number, item: { priceSnapshot: number; quantity: number }) => sum + item.priceSnapshot * item.quantity, 0) * 100) / 100;
    if (Math.abs(lineSubtotal - subtotal) > 0.02) {
      throw new Error("The saved order items do not reconcile with the order subtotal. No invoice data was sent.");
    }

    const vipDiscount = money(order.vip_discount ?? 0, "VIP discount");
    const couponDiscount = money(order.coupon_discount ?? 0, "coupon discount");
    const deliveryCharge = money(order.delivery_charge ?? 0, "delivery charge");
    const finalTotal = money(order.final_total, "final total");
    const effectiveOrderDiscount = Math.min(subtotal, vipDiscount + couponDiscount);
    const reconciledTotal = Math.round((Math.max(0, subtotal - effectiveOrderDiscount) + deliveryCharge) * 100) / 100;
    if (Math.abs(reconciledTotal - finalTotal) > 0.03) {
      throw new Error("The saved discounts, delivery charge and final total do not reconcile. Review the order before invoicing.");
    }

    const customerSnapshot = order.customer_snapshot && typeof order.customer_snapshot === "object"
      ? order.customer_snapshot as Record<string, unknown>
      : (order.customers ?? {}) as Record<string, unknown>;
    const customerSnapshotAvailable = Boolean(order.customer_snapshot && typeof order.customer_snapshot === "object");
    const customerName = String(customerSnapshot.name ?? "").trim();
    const customerPhone = String(customerSnapshot.phone ?? "").trim();
    if (!customerName) throw new Error("The order has no customer name. Correct the customer record before invoicing.");
    const addressParts = [
      String(customerSnapshot.address ?? "").trim(),
      customerSnapshot.landmark ? `Landmark: ${String(customerSnapshot.landmark).trim()}` : "",
    ].filter(Boolean);

    const orderReference = String(order.order_reference ?? "").trim();
    if (!orderReference) throw new Error("The order reference is missing.");
    const requestId = `ORDER_${orderReference.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    if (!/^[A-Za-z0-9_-]{10,100}$/.test(requestId)) throw new Error("The order reference cannot be used as an invoice idempotency key.");

    const payload = {
      version: 1,
      source: "WEBSITE_ORDER",
      orderId: String(order.id),
      orderReference,
      requestId,
      orderDate: localDateISO(String(order.created_at)),
      customerSnapshotAvailable,
      customer: {
        name: customerName,
        phone: customerPhone,
        address: addressParts.join(", "),
        area: String(customerSnapshot.area ?? "").trim(),
        note: String(order.notes ?? "").trim().slice(0, 1200),
      },
      items,
      subtotal,
      vipDiscount,
      couponDiscount,
      couponCode: String(order.coupons?.code ?? "").trim(),
      deliveryCharge,
      finalTotal,
    };

    const payloadJson = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signPayload(payloadJson, timestamp, signingSecret);

    return json({ payloadJson, timestamp, signature });
  } catch (error) {
    console.error("prepare-invoice error:", error);
    return json({ error: error instanceof Error ? error.message : "The invoice could not be prepared." }, 400);
  }
});
