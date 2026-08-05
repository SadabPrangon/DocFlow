const mongoose = require('mongoose');
const Stripe = require('stripe');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const PaymentEvent = require('../models/PaymentEvent');
const { notify, audit } = require('../lib/activity');

const stripeClient = () => process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const validId = (value) => mongoose.isObjectIdOrHexString(value);

const createCheckout = async (req, res) => {
  try {
    if (!validId(req.params.appointmentId)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
    const stripe = stripeClient(); if (!stripe) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    const appointment = await Appointment.findOne({ _id: req.params.appointmentId, patient: req.user._id, status: { $in: ['Pending', 'Approved'] } });
    if (!appointment) return res.status(404).json({ success: false, message: 'Payable appointment not found.' });
    if (appointment.paymentStatus === 'Paid') return res.status(409).json({ success: false, message: 'Appointment is already paid.' });
    if (!(appointment.fee > 0)) return res.status(400).json({ success: false, message: 'This appointment does not require an online payment.' });
    let payment = await Payment.findOne({ appointment: appointment._id, status: 'Pending', checkoutExpiresAt: { $gt: new Date() } }).select('+checkoutUrl');
    if (payment?.checkoutUrl) return res.json({ success: true, checkoutUrl: payment.checkoutUrl, payment });
    payment = await Payment.create({ appointment: appointment._id, patient: req.user._id, amountMinor: Math.round(appointment.fee * 100), currency: String(process.env.PAYMENT_CURRENCY || 'bdt').toLowerCase() });
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({ mode: 'payment', client_reference_id: String(appointment._id), customer_email: req.user.email, success_url: `${clientUrl}/payments?status=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${clientUrl}/payments?status=cancelled`, line_items: [{ quantity: 1, price_data: { currency: payment.currency, unit_amount: payment.amountMinor, product_data: { name: `Appointment with ${appointment.doctorName}`, description: `${appointment.appointmentDate} at ${appointment.appointmentTime}` } } }], metadata: { appointmentId: String(appointment._id), paymentId: String(payment._id) } });
    payment.providerSessionId = session.id; payment.checkoutUrl = session.url; payment.checkoutExpiresAt = session.expires_at ? new Date(session.expires_at * 1000) : new Date(Date.now() + 30 * 60 * 1000); payment.status = 'Pending'; await payment.save();
    await audit(req, 'payment.checkout_created', 'Payment', payment._id, { appointment: appointment._id });
    res.json({ success: true, checkoutUrl: session.url, payment });
  } catch (error) { console.error('Create checkout error:', error.message); res.status(502).json({ success: false, message: 'Unable to create the secure payment session.' }); }
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
      if (payment && session.payment_status === 'paid') { payment.status = 'Paid'; payment.paymentIntentId = String(session.payment_intent || ''); payment.paidAt = new Date(); await payment.save(); const appointment = await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'Paid', paymentMethod: 'online' }, { returnDocument: 'after' }); await notify(payment.patient, { type: 'appointment', title: 'Payment received', message: 'Your appointment payment was successful.', link: '/payments' }); if (appointment) appointment.paymentStatus = 'Paid'; }
    } else if (event.type === 'checkout.session.expired') await Payment.findOneAndUpdate({ providerSessionId: event.data.object.id, status: 'Pending' }, { status: 'Failed' });
    await PaymentEvent.create({ eventId: event.id, type: event.type });
    res.json({ received: true });
  } catch (error) { console.error('Stripe webhook processing error:', error.message); res.status(500).json({ received: false }); }
};

const listMine = async (req, res) => res.json({ success: true, payments: await Payment.find({ patient: req.user._id }).populate('appointment', 'doctorName appointmentDate appointmentTime').sort({ createdAt: -1 }) });
const refund = async (req, res) => {
  const stripe = stripeClient(); if (!stripe) return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
  const payment = await Payment.findById(req.params.id); if (!payment || payment.status !== 'Paid' || !payment.paymentIntentId) return res.status(404).json({ success: false, message: 'Refundable payment not found.' });
  await stripe.refunds.create({ payment_intent: payment.paymentIntentId }); payment.status = 'Refunded'; payment.refundedAt = new Date(); await payment.save(); await Appointment.findByIdAndUpdate(payment.appointment, { paymentStatus: 'Pending' }); await audit(req, 'payment.refunded', 'Payment', payment._id, {}); res.json({ success: true, message: 'Refund submitted.', payment });
};
module.exports = { createCheckout, webhook, listMine, refund };
