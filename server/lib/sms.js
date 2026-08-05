const sendSms = async (to, body) => {
  const { TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from, TWILIO_MESSAGING_SERVICE_SID: service } = process.env;
  if (!account || !token || (!from && !service)) throw new Error('Twilio SMS is not configured.');
  if (!/^\+[1-9]\d{7,14}$/.test(String(to || ''))) throw new Error('Recipient phone must use E.164 format.');
  const params = new URLSearchParams({ To: to, Body: String(body).slice(0, 1500) }); if (service) params.set('MessagingServiceSid', service); else params.set('From', from);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Twilio rejected the message.'); return { sid: data.sid, status: data.status };
};
module.exports = { sendSms };
