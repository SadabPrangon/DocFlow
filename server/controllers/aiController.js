const mongoose = require('mongoose');
const careAssistant = require('../lib/careAssistant');
const ollama = require('../lib/ollama');
const AiConversation = require('../models/AiConversation');

const MAX_MESSAGE = 1000;
const MAX_TURNS = 100;          // per conversation
const MAX_CONVERSATIONS = 50;   // per patient, oldest pruned

const validId = (value) => mongoose.isObjectIdOrHexString(value);
const titleFrom = (text) => String(text).replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
const summary = (conversation) => ({
  id: conversation._id,
  title: conversation.title,
  updatedAt: conversation.updatedAt,
  messageCount: conversation.messages.length,
});

const recommend = async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Describe your symptoms first.' });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ success: false, message: `Keep it under ${MAX_MESSAGE} characters.` });

    let conversation = null;
    if (req.body.conversationId) {
      if (!validId(req.body.conversationId)) return res.status(400).json({ success: false, message: 'Invalid conversation.' });
      conversation = await AiConversation.findOne({ _id: req.body.conversationId, user: req.user._id });
      if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    // The stored transcript is the source of truth for context, not whatever the
    // browser sends, so a tampered payload cannot rewrite the conversation.
    const history = conversation
      ? conversation.messages.slice(-6).map((item) => ({ role: item.role, text: item.text }))
      : [];

    const result = await careAssistant.answer({ message, history });

    if (!conversation) {
      conversation = new AiConversation({ user: req.user._id, title: titleFrom(message) });
      const count = await AiConversation.countDocuments({ user: req.user._id });
      if (count >= MAX_CONVERSATIONS) {
        const oldest = await AiConversation.find({ user: req.user._id }).sort({ updatedAt: 1 }).limit(count - MAX_CONVERSATIONS + 1).select('_id');
        await AiConversation.deleteMany({ _id: { $in: oldest.map((item) => item._id) } });
      }
    }
    conversation.messages.push({ role: 'user', text: message });
    conversation.messages.push({ role: 'assistant', text: result.reply, recommendations: result.recommendations || [], urgent: Boolean(result.urgent) });
    if (conversation.messages.length > MAX_TURNS) conversation.messages = conversation.messages.slice(-MAX_TURNS);
    await conversation.save();

    res.json({ success: true, conversationId: conversation._id, title: conversation.title, ...result });
  } catch (error) {
    console.error('Care assistant error:', error.message);
    res.status(500).json({ success: false, message: 'The care assistant is unavailable right now.' });
  }
};

const listConversations = async (req, res) => {
  const items = await AiConversation.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(MAX_CONVERSATIONS);
  res.json({ success: true, conversations: items.map(summary) });
};

const getConversation = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid conversation.' });
  const conversation = await AiConversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
  res.json({ success: true, conversation: { ...summary(conversation), messages: conversation.messages } });
};

const deleteConversation = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid conversation.' });
  const removed = await AiConversation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!removed) return res.status(404).json({ success: false, message: 'Conversation not found.' });
  res.json({ success: true, message: 'Chat deleted.' });
};

const status = async (req, res) => res.json({
  success: true,
  enabled: ollama.enabled(),
  model: ollama.model(),
  modelReady: await ollama.isAvailable(),
});

module.exports = { recommend, status, listConversations, getConversation, deleteConversation };
