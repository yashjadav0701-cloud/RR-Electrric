# RR ELECTRRIC — website + Invoice Studio deployment

This package keeps the current Supabase order system and the existing Google Sheets invoice template. It does not replace the workbook's `Invoice_Manual` layout or change the `Products` sheet structure.

## What changed

- Accepted orders in the Admin Orders panel have an icon-only invoice action.
- The website requests an authenticated Supabase Edge Function to read the canonical accepted order and sign a short-lived invoice payload.
- Google Apps Script verifies the HMAC before showing the invoice form.
- Website invoices use saved product-name, quantity, unit-price, MRP and warranty snapshots. They do not look up today's catalogue prices.
- Customer details are snapshotted when a new order is placed. Old orders without that snapshot are marked for customer-detail review in Invoice Studio.
- New order items store their original cart position. Existing rows are not assigned a fabricated historical sequence.
- The generated PDF is saved to `Invoice-PDF` in Drive and the same PDF is offered for download.
- Repeating the same order invoice request returns the existing successful PDF rather than creating another invoice.
- Manual invoices are available from the Google Sheet menu and from the new authenticated PWA at `https://rrelectrric.vercel.app/invoice-studio/`.
- The Apps Script `/exec` GET route redirects to the PWA; it never exposes the catalogue or invoice form anonymously. Signed website POST hand-offs still open the existing Apps Script HTML form.
- Product cards use the same responsive system throughout the storefront: 2 columns on phones, 4 on tablets, 6 on laptops/desktops. Add to cart is a neutral outline control with no filled background.

## Required deployment order

### 1. Apply the database SQL

In Supabase Dashboard → SQL Editor, run the complete file:

`SUPABASE_INVOICE_SCHEMA_UPDATE.sql`

The same SQL is also represented by the versioned migration files:

- `supabase/migrations/004_order_customer_snapshot.sql`
- `supabase/migrations/005_order_item_line_number.sql`

Run the combined SQL once in the SQL Editor. Do not separately run the two individual files as a second step. The operations are additive and use `IF NOT EXISTS` guards.

### 2. Create one shared signing secret

Generate a random secret locally in PowerShell (do not paste it into website JavaScript or commit it to Git):

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$INVOICE_SHARED_SECRET = [Convert]::ToBase64String($bytes)
$INVOICE_SHARED_SECRET
```

Use the exact same generated value in both locations below.

**Supabase Edge Function secret** (from the project directory):

```powershell
npx supabase secrets set INVOICE_SHARED_SECRET="$INVOICE_SHARED_SECRET" --project-ref ycckkswajajrqobrohcx
```

**Google Apps Script Script Property:**

1. Open the Apps Script project bound to the RR ELECTRRIC invoice spreadsheet.
2. Open Project Settings → Script Properties.
3. Add `INVOICE_SHARED_SECRET` with the exact same generated value.
4. Do not add the secret to `Code.gs`, `Index.html`, the website source, or Git.

### 3. Update the bound Google Apps Script project

In the existing Apps Script project, replace the complete contents of:

- `Code.gs` with the supplied `Code.gs`
- `Index.html` with the supplied `Index.html`

Keep the existing spreadsheet itself and its `Invoice_Manual`, `Products` and `Invoice_Log` tabs. The supplied `.xlsx` in this bundle is the unchanged source workbook for reference; it does not need to be re-imported or replaced.

Run `setupSystem()` once from the Apps Script editor, or use the spreadsheet's `INVOICE STUDIO → Setup Invoice System` menu. This stores the spreadsheet ID and ensures the PDF folder exists. Do not delete other Script Properties or triggers. The existing `INVOICE_SHARED_SECRET` property must remain in place.

### 4. Deploy the Apps Script Web App

**Important form-POST compatibility fix:** The supplied `Code.gs` now decodes the URL-encoded `payloadJson`, `timestamp` and `signature` fields directly from `e.postData.contents` when Apps Script does not populate `e.parameter`. This avoids attempting `JSON.parse()` on a body beginning with `payloadJson=...`. Replace the complete `Code.gs` and `Index.html` before deploying a **New version** of the Web App.


In Apps Script → Deploy → Manage deployments → Edit the existing Web App deployment:

- Execute as: **Me** (the spreadsheet/Drive owner)
- Who has access: **Anyone** (the website needs to POST the signed hand-off without a Google login)
- Select **New version**, then Deploy

Keep the same `/exec` URL. It is already referenced by the website code and the existing product-sync webhook. The HMAC signature and expiry checks are required for website invoice preparation and for the new authenticated PWA-to-Apps-Script API. `doGet()` redirects users to the authenticated PWA and never exposes the manual catalogue or form anonymously.

**Verify the deployed version before testing:** after deploying, open the exact `/exec` URL currently configured in `admin.js`, adding `?diag=1`. It must display:

```text
BUILD_ID=RR-ELECTRRIC-INVOICE-STUDIO-2026-11-02-PWA-API-V4
HANDOFF_PARSER=FORM_AND_JSON_V3
STUDIO_API=SIGNED_HMAC_V1
STATUS=ACTIVE
```

If it does not, the website is still pointed at an older Web App deployment or the existing deployment was not updated to a New version. In Manage deployments, edit the existing Web App deployment and create a New version; do not create a separate deployment unless you also update `INVOICE_STUDIO_WEB_APP_URL` in `admin.js` to that new `/exec` URL.

The current `Code.gs` accepts the normal browser URL-encoded POST body, a whole-body URL-encoded variant, and the legacy JSON hand-off envelope. It separately accepts a short-lived HMAC-signed `studioApi` envelope from the new Supabase proxy. It only calls `JSON.parse()` for bodies that begin as JSON, so a form body beginning with `payloadJson=` cannot be mistaken for the existing Supabase product-sync JSON webhook.

### 5. Direct URL and installable Invoice Studio app

The new manual-invoice URL is:

`https://rrelectrric.vercel.app/invoice-studio/`

This is a separate Progressive Web App (PWA) with its own manifest, 192px/512px icons and service worker. On supported browsers, use **Install App** in the top bar. On iPhone/iPad, open the page in Safari, tap **Share**, then **Add to Home Screen**. The app shell can be cached for quicker startup, but catalogue loading, authentication, invoice saving and PDF creation require an internet connection.

The PWA uses the same Supabase Auth session as the RR ELECTRRIC website. It also signs in users directly when needed. Both the Supabase Edge Function and Apps Script independently enforce the admin/HMAC boundary; do not expose the service-role key or `INVOICE_SHARED_SECRET` in frontend files.

No additional database migration is required for this PWA proxy. It uses the existing `user_roles` admin assignment and the existing invoice spreadsheet tabs.

Deployment steps for this feature:

1. In the bound Apps Script project, replace `Code.gs` with the updated file in this package. Keep `Index.html` unchanged; it is still used by signed website-order hand-offs and the Google Sheets modal.
2. Deploy the Apps Script Web App as a **New version**, keeping the existing deployment URL, Execute as **Me**, access **Anyone**. The `/exec` GET route now redirects to the PWA; `?diag=1` remains available.
3. From the website project root, deploy the new authenticated proxy function:

   ```powershell
   npx supabase functions deploy invoice-studio --project-ref ycckkswajajrqobrohcx
   ```

4. Confirm the existing `INVOICE_SHARED_SECRET` is still set in Supabase Edge Function secrets and Apps Script Script Properties. The new function uses this same secret; do not generate a different value for it. `INVOICE_STUDIO_WEB_APP_URL` is optional because the function contains the current dedicated deployment URL as its default.
5. Deploy the updated website project to Vercel. The PWA is served from `/invoice-studio/` and is installable on supported browsers.

The new Edge Function is configured with `verify_jwt = false` solely so its `OPTIONS` preflight reaches the handler. The function explicitly validates the bearer session with `auth.getUser()` and checks `user_roles.role = admin` before proxying any request. Apps Script then independently verifies the short-lived HMAC envelope. Keep both checks in place.

## 6. Deploy the Supabase Edge Functions

From the website project root:

```powershell
npx supabase functions deploy create-order --project-ref ycckkswajajrqobrohcx
npx supabase functions deploy prepare-invoice --project-ref ycckkswajajrqobrohcx
```

`create-order` is updated to save `customer_snapshot` and `line_number`. `prepare-invoice` verifies the logged-in admin, loads the accepted order and item snapshots, reconciles the order totals, signs the payload and returns it to the browser.

### 7. Deploy the website

Deploy the contents of this website ZIP to the existing Vercel/GitHub project, preserving the current project root. The new `/invoice-studio/` application has its own manifest, service worker and correctly sized app icons. The existing storefront and admin PWA files are retained.

## First end-to-end test

1. Place a small test order on the website.
2. In the Admin panel, accept the order.
3. Click the icon-only invoice action on that accepted order.
4. Confirm Invoice Studio shows the matching order reference and the correct saved product names, quantities and historical prices.
5. Verify customer details. Older orders without `customer_snapshot` show a warning and must be checked manually.
6. Click **Generate PDF**. The script creates a temporary copy of `Invoice_Manual`, saves the PDF in Drive, logs the invoice and downloads the same PDF.
7. Click the invoice action again. It should return the existing PDF for that order rather than create a duplicate.
8. Create a manual invoice from the spreadsheet menu and confirm the original manual workflow still works.

## Data and limitations intentionally preserved

- Existing accepted orders are not rewritten or backfilled with current customer details. The linked customer profile may have changed since those orders were placed.
- Existing `order_items` are not assigned invented cart positions. They are displayed using a deterministic `created_at`, then `id` fallback.
- The invoice template and workbook formatting are unchanged. The script adds/reuses `Discount Reason`, `Submission ID` and `Order Reference` audit columns in `Invoice_Log` without replacing the existing A:H/I content.
- Taxes/GST are not invented or recalculated by this change. The uploaded `Invoice_Manual` template is headed **Tax Invoice**, but the inspected template contains no GSTIN, HSN/SAC, tax-rate, taxable-value or GST-breakup fields, and the supplied database audit contains no order-level tax fields. Confirm the correct GST/non-GST document treatment before using this template as a statutory GST tax invoice. The implementation intentionally does not infer tax rates.
- The existing Supabase product-sync POST behavior and its URL are preserved.

## Validation performed

JavaScript syntax checks passed for `app.js` and `admin.js`. The inline HTML form script and Apps Script source passed Node syntax parsing after substituting the Apps Script template expression. JSON configuration files parsed successfully. The database changes have not been executed against your live project from this session, and Apps Script/Supabase deployment cannot be exercised without access to your accounts. Complete the SQL and deployment steps above, then run the end-to-end test.
