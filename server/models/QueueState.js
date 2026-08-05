const mongoose = require('mongoose');

const queueStateSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  appointmentDate: { type: String, required: true, index: true },
  lastQueueNumber: { type: Number, default: 0 },
  currentAppointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  paused: { type: Boolean, default: false },
  closed: { type: Boolean, default: false },
  statusReason: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('QueueState', queueStateSchema);
