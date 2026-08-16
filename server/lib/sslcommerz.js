const SANDBOX_BASE_URL = 'https://sandbox.sslcommerz.com';
const LIVE_BASE_URL = 'https://securepay.sslcommerz.com';

const sandbox = () => String(process.env.SSLCOMMERZ_SANDBOX || 'true').toLowerCase() !== 'false';
const baseUrl = () => (sandbox() ? SANDBOX_BASE_URL : LIVE_BASE_URL);
const credentials = () => ({
  store_id: String(process.env.SSLCOMMERZ_STORE_ID || '').trim(),
  store_passwd: String(process.env.SSLCOMMERZ_STORE_PASSWORD || '').trim(),
});
const isConfigured = () => {
  const { store_id: storeId, store_passwd: storePassword } = credentials();
  return Boolean(storeId && storePassword);
};

// Store credentials travel in the request body/query, so never log a built URL.
const request = async (path, fields, method = 'POST') => {
  const params = new URLSearchParams({ ...credentials(), ...fields });
  const response = await fetch(method === 'GET' ? `${baseUrl()}${path}?${params}` : `${baseUrl()}${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: method === 'POST' ? params : undefined,
    signal: AbortSignal.timeout(Number(process.env.SSLCOMMERZ_TIMEOUT_MS) || 15000),
  });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`SSLCommerz returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(data.failedreason || `SSLCommerz request failed with HTTP ${response.status}.`);
  return data;
};

const createSession = async (payload) => {
  const data = await request('/gwprocess/v4/api.php', payload);
  if (String(data.status).toUpperCase() !== 'SUCCESS' || !data.GatewayPageURL) {
    throw new Error(data.failedreason || 'SSLCommerz refused to open a payment session.');
  }
  return { gatewayUrl: data.GatewayPageURL, sessionKey: data.sessionkey || '' };
};

// The gateway's browser redirect is not proof of payment; only this server-to-server
// lookup against val_id is, so every settlement path has to go through it.
const validateTransaction = (valId) => request('/validator/api/validationserverAPI.php', { val_id: valId, format: 'json' }, 'GET');

const refundTransaction = (fields) => request('/validator/api/merchantTransIDvalidationAPI.php', { ...fields, format: 'json' }, 'GET');

module.exports = { isConfigured, sandbox, baseUrl, createSession, validateTransaction, refundTransaction };
