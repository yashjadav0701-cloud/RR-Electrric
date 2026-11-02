# RR ELECTRRIC Invoice Studio — 502 and service-worker correction

This patch corrects the Invoice Studio PWA response-cache lifecycle and improves the Apps Script bridge diagnostics.

## What changed

1. `invoice-studio/sw.js`
   - Cache version is now `rr-invoice-studio-pwa-v2`.
   - Every cacheable `Response` is cloned synchronously before any asynchronous Cache API operation.
   - Cache writes are attached to the fetch event lifetime and cache-write failures do not break the live response.
   - The previous `rr-invoice-studio-pwa-v1` cache is removed during activation.

2. `supabase/functions/invoice-studio/index.ts`
   - Supports both legacy Supabase Edge Function key environment variables and the current `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` key maps.
   - Keeps the existing end-user JWT validation and `user_roles.role = admin` check.
   - Keeps HMAC signing and the Google Apps Script POST body unchanged.
   - Reports safe diagnostic metadata when Apps Script returns HTML, an unrecognized response, a missing result, or a server/network failure. It never returns a JWT, API key, HMAC secret, or response body to the browser.
   - Continues following Google Apps Script ContentService redirects, as required by Google's documentation.

3. `invoice-studio/index.html`
   - Distinguishes successful administrator sign-in from a later backend/API failure; a 502 is no longer presented as a password failure.
   - Reads the Edge Function's diagnostic response from a cloned error response.

## Deploy in this order

### A. Deploy the Supabase Edge Function

From the website repository root:

```powershell
npx supabase functions deploy invoice-studio --project-ref ycckkswajajrqobrohcx
```

Ensure these secrets still exist in Supabase Edge Function secrets:

- `INVOICE_SHARED_SECRET` (must exactly match the Apps Script Script Property)
- `INVOICE_STUDIO_WEB_APP_URL` (optional; if set, it must be the current HTTPS `/exec` URL)

Supabase injects its standard API key environment variables. The updated code supports both the legacy variables and the current key-map variables.

### B. Confirm the Apps Script deployment version

Open the exact existing Web App `/exec` URL and append `?diag=1`.
It must show all of the following:

```text
BUILD_ID=RR-ELECTRRIC-INVOICE-STUDIO-2026-11-02-PWA-API-V4
HANDOFF_PARSER=FORM_AND_JSON_V3
STUDIO_API=SIGNED_HMAC_V1
STATUS=ACTIVE
```

If the build ID is absent or different, open the bound RR ELECTRRIC invoice Apps Script project, replace `Code.gs` with `RR_ELECTRRIC_Code_V4.gs`, then Deploy -> Manage deployments -> Edit existing Web App -> New version -> Deploy. Keep Execute as `Me`, access `Anyone`, and retain the existing deployment URL. Keep the existing `Index.html` file.

Also confirm Script Properties contains `INVOICE_SHARED_SECRET`, matching the Supabase secret exactly. Do not paste that secret into frontend code or Git.

### C. Deploy the website

Deploy the updated website contents to the same Vercel project. The replacement service worker is at:

`invoice-studio/sw.js`

### D. Refresh the installed/browser app

After the Vercel deployment completes, close all Invoice Studio tabs/windows and reopen:

`https://rrelectrric.vercel.app/invoice-studio/`

The new service worker version should activate and remove the old v1 cache. If the old error remains, in Chrome open DevTools -> Application -> Service Workers, unregister the worker scoped to `/invoice-studio/`, then Application -> Storage -> Clear site data, and reload the URL. This removes cached application files only; it does not delete invoices in Drive or spreadsheet records.

## Interpreting the new error details

- `stage: apps_script_fetch`: the Edge Function could not reach the Google Apps Script URL.
- `stage: apps_script_response`: Google returned an HTML/web page rather than the JSON response; check the Web App URL, `Anyone` access and V4 deployment.
- `stage: apps_script_application`: Apps Script returned JSON but rejected the API request. The diagnostic includes the Apps Script `buildId` when available. A stale build typically means V4 Code.gs was not deployed.
- `stage: apps_script_result`: Apps Script reported success but returned no result; inspect Apps Script Executions.
- HTTP 401: Supabase session is missing or expired.
- HTTP 403: signed-in user is not assigned `role = admin` in `user_roles`.
- HTTP 500 at role check: server key/role table configuration issue.

## Security

Do not set the Edge Function to trust the browser's claimed role. The server verifies the Supabase user token, reads the admin role server-side, signs the server-to-server envelope, and Apps Script independently verifies the HMAC and freshness window. Do not expose the Supabase secret/service-role key or `INVOICE_SHARED_SECRET` in the browser.
