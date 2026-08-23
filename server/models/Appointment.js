const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorName: { type: String, required: true },
    specialty: { type: String, required: true },
    location: { type: String, required: true },
    fee: { type: Number, required: true, min: 0 },
    appointmentDate: { type: String, required: true, index: true },
    appointmentTime: { type: String, required: true },
    serial: { type: Number, default: null },
    reason: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Completed', 'Cancelled', 'No-show'],
      default: 'Pending',
      index: true,
    },
    queueNumber: { type: Number, default: null },
    queueStatus: {
      type: String,
      enum: ['Waiting', 'Current', 'Completed', 'Skipped'],
      default: 'Waiting',
    },
    isCurrentServing: { type: Boolean, default: false },
    doctorNotes: { type: String, default: '' },
    prescription: { type: String, default: '' },
    paymentMethod: { type: String, enum: ['cash', 'online'], default: 'cash' },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    bookingKey: { type: String, unique: true, sparse: true, select: false },
    slotKey: { type: String, unique: true, sparse: true, select: false },
    rescheduleCount: { type: Number, default: 0 },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: '', trim: true },
    reminderSentAt: { type: Date, default: null },
    reminderClaimedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

appointmentSchema.index({ doctor: 1, appointmentDate: 1, queueNumber: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
