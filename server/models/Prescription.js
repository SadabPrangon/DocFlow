const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  medicines: [{
    name: { type: String, required: true, trim: true }, dosage: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true }, duration: { type: String, required: true, trim: true }, instructions: { type: String, default: '' },
  }],
  advice: { type: String, default: '', maxlength: 5000 },
  followUpDate: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
}, { timestamps: true });
module.exports = mongoose.model('Prescription', schema);
