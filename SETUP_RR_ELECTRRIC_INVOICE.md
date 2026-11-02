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
- Manual invoices remain available from the Google Sheet menu: `INVOICE STUDIO → Open HTML Invoice Form`.
- Anonymous GET access to the deployed Apps Script web-app URL displays a short notice instead of exposing the manual product catalogue/form. Signed website POST hand-offs still open the invoice form.
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

Run `setupSystem()` once from the Apps Script editor, or use the spreadsheet's `INVOICE STUDIO → Setup Invoice System` menu. This stores the spreadsheet ID and ensures the PDF folder exists. Do not delete other Script Properties or triggers.

### 4. Deploy the dedicated Invoice Studio Web App

Use the dedicated Invoice Studio Web App deployment URL below. This is intentionally separate from the older Google Apps Script URL used by the existing Supabase product-sync trigger:

`https://script.google.com/macros/s/AKfycbwtqsx4naszPK6Q8nQrdq3eMOMMl3K_JVfQkSs5cKAyO4e-gt-RFxYxhIlCwyR-O9O6Tg/exec`

In the Invoice Generator Apps Script project:

- Confirm the deployed project contains the updated top-level `doGet(e)` and `doPost(e)` functions.
- Deploy as a **Web app**.
- Execute as: **Me** (the spreadsheet/Drive owner).
- Who has access: **Anyone** (the website posts the signed hand-off without a Google login).
- Deploy a **New version** and keep the dedicated URL above in sync with the website.

Do not change the legacy product-sync trigger URL in Supabase. The HMAC signature and expiry check are required for website invoice preparation. Anonymous GET access must not expose the manual invoice form; staff open manual invoices from the spreadsheet menu. The `?diag=1` diagnostic route should identify the running build when `doGet(e)` is present.

### 5. Deploy the Supabase Edge Functions

From the website project root:

```powershell
npx supabase functions deploy create-order --project-ref ycckkswajajrqobrohcx
npx supabase functions deploy prepare-invoice --project-ref ycckkswajajrqobrohcx
```

`create-order` is updated to save `customer_snapshot` and `line_number`. `prepare-invoice` verifies the logged-in admin, loads the accepted order and item snapshots, reconciles the order totals, signs the payload and returns it to the browser.

**CORS / JWT gateway setting:** `supabase/config.toml` intentionally sets `verify_jwt = false` for `prepare-invoice` only. This lets browser `OPTIONS` preflight requests reach the function. The function itself still validates the supplied bearer token with `auth.getUser()` and checks the caller's `user_roles` admin record before reading any order data. Keep both checks in place; do not remove the in-function authentication.

### 6. Deploy the website

Deploy the contents of this website ZIP to the existing Vercel/GitHub project, preserving the current project root. The frontend asset versions and service-worker cache have been incremented to avoid serving the old product-card and admin JavaScript.

## Local preview note

The `/rr` admin route is a hosting rewrite configured in `vercel.json` and `netlify.toml`; a plain static server such as VS Code Live Server does not implement that rewrite. For local testing, open `/admin.html` directly. The service worker no longer tries to precache `/rr` as a physical file, and it caches core assets independently so one missing optional asset cannot cancel the whole precache.

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
