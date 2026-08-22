const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true, maxlength: 4000 },
  recommendations: { type: Array, default: [] },
  urgent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'New chat', trim: true, maxlength: 80 },
  messages: { type: [messageSchema], default: [] },
}, { timestamps: true });

schema.index({ user: 1, updatedAt: -1 });
module.exports = mongoose.model('AiConversation', schema);
