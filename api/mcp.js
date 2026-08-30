// api/mcp.js
// Remote MCP (Model Context Protocol) server for AK-LOGIC-AI-GST.

import { resolveMerchant, callTool, TOOL_DEFS } from './_lib/merchantTools.js';

const TOOLS = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.parameters,
}));

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function getRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const body = getRequestBody(req);
    const id = body.id !== undefined ? body.id : 1;
    const method = body.method;
    const params = body.params;

    // MCP methods that don't require auth (capability handshake)
    if (method === 'initialize') {
      res.status(200).json(
        rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'ak-logic-gst-billing', version: '1.0.0' },
        })
      );
      return;
    }

    if (method === 'notifications/initialized') {
      res.status(200).end();
      return;
    }

    const authHeader = req.headers.authorization || req.headers.Authorization;
    let merchantId;
    try {
      merchantId = await resolveMerchant(authHeader);
    } catch (authErr) {
      res.status(401).json(rpcError(id, -32001, authErr?.message || 'Invalid or missing access token.'));
      return;
    }

    if (method === 'tools/list') {
      res.status(200).json(rpcResult(id, { tools: TOOLS }));
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params ?? {};
      const data = await callTool(merchantId, name, args ?? {});
      res.status(200).json(
        rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        })
      );
      return;
    }

    res.status(200).json(rpcError(id, -32601, `Method not found: ${method}`));
  } catch (err) {
    console.error('MCP handler error:', err);
    res.status(500).json(
      rpcResult(1, {
        isError: true,
        content: [{ type: 'text', text: err?.message ?? 'Internal server error' }],
      })
    );
  }
}
