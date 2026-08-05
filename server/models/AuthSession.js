const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jtiHash: { type: String, required: true, unique: true },
  device: { type: String, default: 'Unknown device' },
  ip: { type: String, default: '' },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
module.exports = mongoose.model('AuthSession', schema);
