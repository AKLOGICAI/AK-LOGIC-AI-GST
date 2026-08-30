# ChatGPT Custom GPT — Setup Guide

Connects a merchant's AK-LOGIC-AI-GST account to a **Custom GPT** so they can
ask ChatGPT to check account details, list invoices, or correct account info.

## 1. Deploy (same as Claude MCP setup)

No extra env vars needed beyond `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
(already set for the MCP connector). These endpoints go live automatically:

```
GET   /api/openai/account
PATCH /api/openai/account
GET   /api/openai/invoices?limit=10
GET   /api/openai/invoice?id=<invoiceId>
```

## 2. Edit the OpenAPI schema

Open `public/openapi-billing.yaml` and replace:

```yaml
servers:
  - url: https://YOUR-VERCEL-DOMAIN.vercel.app/api/openai
```

with your real Vercel domain. After deploy this file is publicly served at:

```
https://<your-domain>/openapi-billing.yaml
```

## 3. Create the Custom GPT

1. In ChatGPT: **Explore GPTs → Create**
2. Give it a name, e.g. "My GST Billing Assistant"
3. Go to **Configure → Actions → Create new action**
4. Click **Import from URL**, paste your `openapi-billing.yaml` URL
5. Under **Authentication**, choose **API Key → Bearer**
   - This is where the merchant will paste their token (from
     `scripts/generate-mcp-token.mjs` — same token works for both Claude
     and ChatGPT, it's just a generic per-merchant access token)
6. Save

## 4. Merchant uses it

The merchant opens the Custom GPT, and (first time) is prompted to enter
their Bearer token once. After that they can ask things like:

- "Show my account details"
- "Update my email to xyz@email.com"
- "List my last 10 invoices"

Every request only ever touches **that merchant's own data** — enforced
server-side in `api/_lib/merchantTools.ts`.

## Note on distribution

A Custom GPT you build like this is **private to your ChatGPT account**
unless you explicitly publish/share it. For giving each merchant their own
Bearer token safely, you may want a separate Custom GPT per merchant, or
(better, longer-term) build a tiny in-app screen where merchants log in and
get their token automatically instead of you generating it manually.
