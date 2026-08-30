# Sarvam AI Integration — Setup Guide

Sarvam AI is different from Claude and ChatGPT: it has no "connector" or
"custom GPT" marketplace that a merchant configures themselves. Instead,
**your own app** calls Sarvam's API from the backend and handles the
conversation — this is exactly the shape of the existing "AKAI assistant"
chat feature already in the app, just pointed at Sarvam instead of (or
alongside) whatever model powers it today.

## 1. Get a Sarvam API key

Sign up at https://sarvam.ai, create an API key (`sk_...`).

## 2. Add the env var (Vercel project settings)

```
SARVAM_API_KEY=sk_xxxxxxxx
```

## 3. Deploy

`api/sarvam/assistant.ts` goes live at:

```
POST https://<your-domain>/api/sarvam/assistant
```

## 4. How the Android/web app calls it

From the app's existing chat UI, call this endpoint instead of
(or in addition to) the current assistant backend:

```ts
const res = await fetch('https://<your-domain>/api/sarvam/assistant', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${merchantMcpToken}`, // same token type as Claude/ChatGPT
  },
  body: JSON.stringify({
    message: userTypedText,
    history: previousMessages, // optional, from your chat state
  }),
});
const { reply, history } = await res.json();
```

The endpoint runs the full tool-calling loop server-side:
Sarvam decides it needs `get_account_info` / `update_account_info` /
`list_recent_invoices` / `get_invoice_detail` → your server executes it,
scoped to the merchant's own data → sends the result back to Sarvam →
Sarvam gives a final natural-language reply → you get back just
`{ reply, history }` to render in the chat UI.

## 5. Why this is different from Claude/ChatGPT

| | Claude | ChatGPT | Sarvam AI |
|---|---|---|---|
| Where merchant "connects" | Inside Claude app (Customize → Connectors) | Inside a Custom GPT | Nowhere — it's embedded in **your** app |
| Who calls Sarvam's API | — | — | Your backend (`api/sarvam/assistant.ts`) |
| Merchant-facing surface | Claude chat | ChatGPT chat | Your app's own chat screen |

Because all three ultimately call the same functions in
`api/_lib/merchantTools.ts`, behavior (what can be read/changed, and the
per-merchant data isolation) is identical everywhere.

## Billing note

Unlike adding a Claude/ChatGPT connector (free for the merchant), **every
Sarvam call is metered against your Sarvam credits** — this is real usage
cost on your side, since it's your app calling the API, not the merchant's
personal AI account. Budget/rate-limit accordingly.
