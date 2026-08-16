const mongoose = require('mongoose');
const crypto = require('crypto');
const Stripe = require('stripe');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const PaymentEvent = require('../models/PaymentEvent');
const sslcommerz = require('../lib/sslcommerz');
const { notify, audit } = require('../lib/activity');

const stripeClient = () => process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const validId = (value) => mongoose.isObjectIdOrHexString(value);
const clientUrl = () => String(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
const serverUrl = () => String(process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
const majorAmount = (amountMinor) => (amountMinor / 100).toFixed(2);

const startStripeCheckout = async (req, res, appointment) => {
  const stripe = stripeClient();
  const payment = await Payment.create({ appointment: appointment._id, patient: req.user._id, provider: 'stripe', amountMinor: Math.round(appointment.fee * 100), currency: String(process.env.PAYMENT_CURRENCY || 'bdt').toLowerCase() });
  const session = await stripe.checkout.sessions.create({ mode: 'payment', client_reference_id: String(appointment._id), customer_email: req.user.email, success_url: `${clientUrl()}/payments?status=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${clientUrl()}/payments?status=cancelled`, line_items: [{ quantity: 1, price_data: { currency: payment.currency, unit_amount: payment.amountMinor, product_data: { name: `Appointment with ${appointment.doctorName}`, description: `${appointment.appointmentDate} at ${appointment.appointmentTime}` } } }], metadata: { appointmentId: String(appointment._id), paymentId: String(payment._id) } });
  payment.providerSessionId = session.id; payment.checkoutUrl = session.url; payment.checkoutExpiresAt = session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + 30 * 60 * 1000); payment.status = 'Pending'; await payment.save();
  await audit(req, 'payment.checkout_created', 'Payment', payment._id, { appointment: appointment._id, provider: 'stripe' });
  res.json({ success: true, provider: 'stripe', checkoutUrl: session.url, payment });
};

const startSslcommerzCheckout = async (req, res, appointment) => {
  const currency = String(process.env.PAYMENT_CURRENCY || 'bdt').toLowerCase();
  const payment = await Payment.create({
    appointment: appointment._id, patient: req.user._id, provider: 'sslcommerz',
    amountMinor: Math.round(appointment.fee * 100), currency,
    tranId: `DF${crypto.randomBytes(12).toString('hex')}`,
  });
  const callback = `${serverUrl()}/api/payments/sslcommerz`;
  try {
    const session = await sslcommerz.createSession({
      total_amount: majorAmount(payment.amountMinor),
      currency: currency.toUpperCase(),
      tran_id: payment.tranId,
      success_url: `${callback}/success`,
      fail_url: `${callback}/fail`,
      cancel_url: `${callback}/cancel`,
      ipn_url: `${callback}/ipn`,
      shipping_method: 'NO',
      num_of_item: 1,
      product_name: `Appointment with ${appointment.doctorName}`,
      product_category: 'Healthcare',
      product_profile: 'non-physical-goods',
      cus_name: req.user.name || 'DocFlow patient',
      cus_email: req.user.email,
      cus_add1: req.user.address || 'Not provided',
      cus_city: 'Dhaka',
      cus_postcode: '1000',
      cus_country: 'Bangladesh',
      cus_phone: req.user.phone || 'Not provided',
      value_a: String(appointment._id),
      value_b: String(payment._id),
    });
    payment.providerSessionId = session.sessionKey || undefined;
    payment.checkoutUrl = session.gatewayUrl;
    payment.checkoutExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    payment.status = 'Pending';
    await payment.save();
    await audit(req, 'payment.checkout_created', 'Payment', payment._id, { appointment: appointment._id, provider: 'sslcommerz' });
    res.json({ success: true, provider: 'sslcommerz', checkoutUrl: session.gatewayUrl, payment });
  } catch (error) {
    payment.status = 'Failed'; payment.tranId = undefined; await payment.save().catch(() => {});
    throw error;
  }
};

const createCheckout = async (req, res) => {
  try {
    if (!validId(req.params.appointmentId)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
    if (!sslcommerz.isConfigured() && !stripeClient()) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    const appointment = await Appointment.findOne({ _id: req.params.appointmentId, patient: req.user._id, status: { $in: ['Pending', 'Approved'] } });
    if (!appointment) return res.status(404).json({ success: false, message: 'Payable appointment not found.' });
    if (appointment.paymentStatus === 'Paid') return res.status(409).json({ success: false, message: 'Appointment is already paid.' });
    if (!(appointment.fee > 0)) return res.status(400).json({ success: false, message: 'This appointment does not require an online payment.' });
    const open = await Payment.findOne({ appointment: appointment._id, status: 'Pending', checkoutExpiresAt: { $gt: new Date() } }).select('+checkoutUrl');
    if (open?.checkoutUrl) return res.json({ success: true, provider: open.provider, checkoutUrl: open.checkoutUrl, payment: open });
    if (sslcommerz.isConfigured()) return await startSslcommerzCheckout(req, res, appointment);
    return await startStripeCheckout(req, res, appointment);
  } catch (error) {
    console.error('Create checkout error:', error.message);
    res.status(502).json({ success: false, message: 'Unable to create the secure payment session.' });
  }
};

const markPaid = async (payment, details) => {
  payment.status = 'Paid';
  payment.valId = details.valId || payment.valId;
  payment.bankTranId = details.bankTranId || payment.bankTranId;
  payment.riskLevel = details.riskLevel || payment.riskLevel;
  payment.paidAt = new Date();
  await payment.save();
  await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'Paid', paymentMethod: 'online' });
  await notify(payment.patient, { type: 'appointment', title: 'Payment received', message: 'Your appointment payment was successful.', link: '/payments' });
};

// Shared by the browser return and the server-to-server IPN; both are untrusted input,
// so the amount and currency are re-checked against what the gateway itself reports.
const settleSslcommerz = async (body = {}) => {
  const valId = String(body.val_id || '').trim();
  if (!valId) return { ok: false, reason: 'missing_val_id' };
  if (await PaymentEvent.exists({ eventId: `sslcommerz:${valId}` })) return { ok: true, reason: 'duplicate' };

  const validation = await sslcommerz.validateTransaction(valId);
  const status = String(validation.status || '').toUpperCase();
  if (!['VALID', 'VALIDATED'].includes(status)) return { ok: false, reason: `gateway_status_${status || 'unknown'}` };

  const payment = await Payment.findOne({ tranId: String(validation.tran_id || '') });
  if (!payment) return { ok: false, reason: 'unknown_transaction' };
  if (payment.status === 'Paid') return { ok: true, reason: 'already_paid' };

  const expected = Number(majorAmount(payment.amountMinor));
  const received = Number(validation.amount);
  if (!Number.isFinite(received) || received + 0.01 < expected) return { ok: false, reason: 'amount_mismatch' };
  if (String(validation.currency || '').toUpperCase() !== payment.currency.toUpperCase()) return { ok: false, reason: 'currency_mismatch' };

  await markPaid(payment, { valId, bankTranId: validation.bank_tran_id, riskLevel: String(validation.risk_level ?? '') });
  await PaymentEvent.create({ eventId: `sslcommerz:${valId}`, type: `sslcommerz.${status.toLowerCase()}` });
  if (String(validation.risk_level) === '1') console.warn(JSON.stringify({ level: 'warn', event: 'payment_risk_flagged', payment: String(payment._id), riskTitle: validation.risk_title }));
  return { ok: true, reason: 'paid', payment };
};

const closeSslcommerz = async (body = {}, status) => {
  const tranId = String(body.tran_id || '').trim();
  if (!tranId) return;
  await Payment.findOneAndUpdate({ tranId, status: { $in: ['Created', 'Pending'] } }, { status });
};

const sslcommerzReturn = (handler, outcome) => async (req, res) => {
  let result = outcome;
  try { result = await handler(req.body); }
  catch (error) { console.error('SSLCommerz return error:', error.message); result = 'failed'; }
  res.redirect(303, `${clientUrl()}/payments?status=${result}`);
};

const sslcommerzSuccess = sslcommerzReturn(async (body) => {
  const result = await settleSslcommerz(body);
  if (!result.ok) console.error(JSON.stringify({ level: 'error', event: 'sslcommerz_settlement_rejected', reason: result.reason }));
  return result.ok ? 'success' : 'failed';
}, 'failed');

const sslcommerzFail = sslcommerzReturn(async (body) => { await closeSslcommerz(body, 'Failed'); return 'failed'; }, 'failed');
const sslcommerzCancel = sslcommerzReturn(async (body) => { await closeSslcommerz(body, 'Cancelled'); return 'cancelled'; }, 'cancelled');

const sslcommerzIpn = async (req, res) => {
  try {
    const result = await settleSslcommerz(req.body);
    if (!result.ok) console.error(JSON.stringify({ level: 'error', event: 'sslcommerz_ipn_rejected', reason: result.reason }));
    res.status(result.ok ? 200 : 400).json({ received: result.ok });
  } catch (error) {
    console.error('SSLCommerz IPN error:', error.message);
    res.status(500).json({ received: false });
  }
};

const webhook = async (req, res) => {
  const stripe = stripeClient();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook is not configured.');
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (error) { return res.status(400).send(`Webhook signature error: ${error.message}`); }
  try {
    if (await PaymentEvent.exists({ eventId: event.id })) return res.json({ received: true, duplicate: true });
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object; const payment = await Payment.findOne({ providerSessionId: session.id });
      if (payment && session.payment_status === 'paid') { payment.paymentIntentId = String(session.payment_intent || ''); await markPaid(payment, {}); }
    } else if (event.type === 'checkout.session.expired') await Payment.findOneAndUpdate({ providerSessionId: event.data.object.id, status: 'Pending' }, { status: 'Failed' });
    await PaymentEvent.create({ eventId: event.id, type: event.type });
    res.json({ received: true });
  } catch (error) { console.error('Stripe webhook processing error:', error.message); res.status(500).json({ received: false }); }
};

const listMine = async (req, res) => res.json({ success: true, payments: await Payment.find({ patient: req.user._id }).populate('appointment', 'doctorName appointmentDate appointmentTime').sort({ createdAt: -1 }) });

const refund = async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment || payment.status !== 'Paid') return res.status(404).json({ success: false, message: 'Refundable payment not found.' });
  const reason = String(req.body.reason || 'Appointment refund').trim().slice(0, 255);
  try {
    if (payment.provider === 'sslcommerz') {
      if (!sslcommerz.isConfigured()) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
      if (!payment.bankTranId) return res.status(409).json({ success: false, message: 'This payment has no gateway transaction reference to refund.' });
      const result = await sslcommerz.refundTransaction({ bank_tran_id: payment.bankTranId, refund_amount: majorAmount(payment.amountMinor), refund_remarks: reason });
      if (!['success', 'processing'].includes(String(result.status || '').toLowerCase())) {
        return res.status(502).json({ success: false, message: result.errorReason || 'The gateway rejected the refund.' });
      }
      payment.refundRefId = String(result.refund_ref_id || '');
    } else {
      const stripe = stripeClient();
      if (!stripe) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
      if (!payment.paymentIntentId) return res.status(409).json({ success: false, message: 'This payment has no gateway transaction reference to refund.' });
      await stripe.refunds.create({ payment_intent: payment.paymentIntentId });
    }
  } catch (error) {
    console.error('Refund error:', error.message);
    return res.status(502).json({ success: false, message: 'Unable to submit the refund.' });
  }
  payment.status = 'Refunded'; payment.refundedAt = new Date(); await payment.save();
  await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'Pending' });
  await audit(req, 'payment.refunded', 'Payment', payment._id, { provider: payment.provider });
  res.json({ success: true, message: 'Refund submitted.', payment });
};

module.exports = { createCheckout, webhook, listMine, refund, sslcommerzSuccess, sslcommerzFail, sslcommerzCancel, sslcommerzIpn };
