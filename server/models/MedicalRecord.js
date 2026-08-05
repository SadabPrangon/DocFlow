const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  diagnosis: { type: String, required: true, trim: true, maxlength: 1000 },
  symptoms: [{ type: String, trim: true }],
  vitals: {
    bloodPressure: { type: String, default: '' }, heartRate: { type: Number, default: null },
    temperatureC: { type: Number, default: null }, weightKg: { type: Number, default: null }, heightCm: { type: Number, default: null },
  },
  allergies: [{ type: String, trim: true }],
  labResults: [{ name: { type: String, required: true }, result: String, unit: String, referenceRange: String }],
  documents: [{ name: { type: String, required: true }, url: { type: String, required: true }, type: String }],
  clinicalNotes: { type: String, default: '', maxlength: 10000 },
}, { timestamps: true });
module.exports = mongoose.model('MedicalRecord', schema);
