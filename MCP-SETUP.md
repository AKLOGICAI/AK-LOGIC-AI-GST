# Claude MCP Connector — Setup Guide

This connects a merchant's AK-LOGIC-AI-GST account to Claude so they can ask
Claude to check account details, list invoices, or correct account info —
directly in a Claude chat.

## 1. Environment variables (Vercel project settings)

Add these two if not already present:
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (Project Settings → API in Supabase)

⚠️ Never expose the service role key to the frontend/client — it must only
exist as a server-side env var, which is how it's used here (inside `api/mcp.ts`).

## 2. Deploy

Since this repo auto-deploys to Vercel on push, merging this branch is enough.
The MCP endpoint will be live at:

```
https://<your-vercel-domain>/api/mcp
```

## 3. Generate a token for a merchant

Until there's an in-app "Connect to Claude" button, generate a token manually:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/generate-mcp-token.mjs <merchantId>
```

This prints a token like `mcp_9f2a...`. Give this only to that merchant.

## 4. Merchant connects Claude

In Claude:
1. Go to **Customize → Connectors**
2. Click **+** → **Add custom connector**
3. Name: `My GST Billing Account`
4. Server URL: `https://<your-vercel-domain>/api/mcp`
5. In **Advanced settings**, set the Authorization header to:
   `Bearer mcp_9f2a...` (their token from step 3)
6. Click **Add**, then **Connect**

Now the merchant can ask Claude things like:
- "मेरे account की GSTIN details दिखाओ"
- "मेरा phone number update करो XXXXXXXXXX पर"
- "पिछले 5 invoices दिखाओ"

Claude will only ever see and modify **that one merchant's** data — the
token-to-merchant mapping is enforced server-side in `api/mcp.ts`.

## 5. Revoking access

```sql
update public.mcp_access_tokens set revoked = true where merchant_id = '<id>';
```

## Notes on ChatGPT / Sarvam AI (future phases)

This `api/mcp.ts` endpoint is MCP-specific (Claude, and any other MCP client).
ChatGPT and Sarvam AI need a slightly different wrapper (OpenAPI schema /
function-calling schema) around the *same* underlying functions
(`getAccountInfo`, `updateAccountInfo`, `listInvoices`, `getInvoiceDetail`).
Those can be added as separate endpoints later without touching this file.
