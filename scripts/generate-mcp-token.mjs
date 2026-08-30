// scripts/generate-mcp-token.mjs
//
// Generates a Claude/MCP access token for one merchant.
// Run with: node scripts/generate-mcp-token.mjs <merchantId>
//
// Requires env vars SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
// (same values used by api/mcp.ts).

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const merchantId = process.argv[2];
if (!merchantId) {
  console.error('Usage: node scripts/generate-mcp-token.mjs <merchantId>');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const token = 'mcp_' + randomBytes(24).toString('hex');

const { error } = await supabase.from('mcp_access_tokens').insert({
  id: crypto.randomUUID(),
  token,
  merchant_id: merchantId,
  label: 'Claude Connector',
  revoked: false,
  created_at: Date.now(),
});

if (error) {
  console.error('Failed to create token:', error.message);
  process.exit(1);
}

console.log('\n✅ Token created for merchant:', merchantId);
console.log('\nGive this to the merchant to paste into Claude (Advanced settings → Authorization header):\n');
console.log('  Bearer ' + token);
console.log('\nKeep this safe — anyone with this token can read/update this merchant\'s account.\n');
