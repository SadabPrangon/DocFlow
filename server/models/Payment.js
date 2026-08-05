const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['stripe'], default: 'stripe' },
  providerSessionId: { type: String, unique: true, sparse: true },
  checkoutUrl: { type: String, default: '', select: false },
  checkoutExpiresAt: { type: Date, default: null },
  paymentIntentId: { type: String, default: '' },
  amountMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'bdt' },
  status: { type: String, enum: ['Created', 'Pending', 'Paid', 'Failed', 'Refunded'], default: 'Created', index: true },
  paidAt: { type: Date, default: null }, refundedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ appointment: 1, status: 1 });
module.exports = mongoose.model('Payment', schema);
