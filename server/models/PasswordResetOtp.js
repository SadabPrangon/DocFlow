const mongoose = require('mongoose');

const passwordResetOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  resetTokenHash: { type: String, default: '' },
  resetTokenExpiresAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
