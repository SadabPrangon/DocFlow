const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, default: '', trim: true },
    role: {
      type: String,
      enum: ['patient', 'admin', 'doctor', 'receptionist'],
      default: 'patient',
      index: true,
    },
    age: { type: Number, default: null, min: 1, max: 120 },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, default: '' },
    address: { type: String, default: '', trim: true },
    specialty: { type: String, default: '', trim: true },
    experience: { type: String, default: '', trim: true },
    location: { type: String, default: '', trim: true },
    fee: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    availability: {
      timezone: { type: String, default: 'Asia/Dhaka' },
      slotDuration: { type: Number, default: 60, min: 15, max: 240 },
      weekly: [{
        day: { type: Number, min: 0, max: 6 },
        enabled: { type: Boolean, default: true },
        start: { type: String, default: '09:00' },
        end: { type: String, default: '17:00' },
      }],
      unavailableDates: [{ type: String }],
      overrides: [{
        date: { type: String },
        enabled: { type: Boolean, default: true },
        start: { type: String, default: '09:00' },
        end: { type: String, default: '17:00' },
        breaks: [{ start: String, end: String }],
      }],
    },
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    mfaEnabled: { type: Boolean, default: false },
    privacyConsent: {
      accepted: { type: Boolean, default: false },
      version: { type: String, default: '' },
      acceptedAt: { type: Date, default: null },
    },
    notificationPreferences: {
      emailReminders: { type: Boolean, default: true },
      smsReminders: { type: Boolean, default: false },
      smsConsentAt: { type: Date, default: null },
      reminderHoursBefore: { type: Number, default: 24, min: 1, max: 168 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
