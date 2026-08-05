const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['appointment', 'queue', 'account', 'system'], default: 'system' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  link: { type: String, default: '' },
  read: { type: Boolean, default: false, index: true },
}, { timestamps: true });

notificationSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('Notification', notificationSchema);
