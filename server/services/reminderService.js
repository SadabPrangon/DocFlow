const Appointment = require('../models/Appointment');
const { appointmentDateTime } = require('../lib/availability');
const { sendAppointmentReminder } = require('../lib/mailer');
const { notify } = require('../lib/activity');
const { sendSms } = require('../lib/sms');

let running = false;
let intervalTimer;
let initialTimer;
const runDueReminders = async () => {
  if (running) return { checked: 0, sent: 0 };
  running = true; let sent = 0;
  try {
    const appointments = await Appointment.find({ status: 'Approved', reminderSentAt: null }).populate('patient', 'email phone notificationPreferences isActive').sort({ appointmentDate: 1 }).limit(500);
    const now = Date.now();
    for (const appointment of appointments) {
      const scheduledAt = appointmentDateTime(appointment.appointmentDate, appointment.appointmentTime);
      const hours = Number(appointment.patient?.notificationPreferences?.reminderHoursBefore || 24);
      if (!scheduledAt || scheduledAt.getTime() <= now || scheduledAt.getTime() - now > hours * 60 * 60 * 1000 || !appointment.patient?.isActive) continue;
      const claimCutoff = new Date(Date.now() - 10 * 60 * 1000);
      const claim = await Appointment.updateOne({ _id: appointment._id, reminderSentAt: null, $or: [{ reminderClaimedAt: null }, { reminderClaimedAt: { $lt: claimCutoff } }] }, { $set: { reminderClaimedAt: new Date() } });
      if (!claim.modifiedCount) continue;
      try {
        let delivered = false;
        if (appointment.patient.notificationPreferences?.emailReminders !== false) { await sendAppointmentReminder(appointment.patient.email, appointment); delivered = true; }
        if (appointment.patient.notificationPreferences?.smsReminders) { await sendSms(appointment.patient.phone, `DocFlow reminder: ${appointment.appointmentDate} at ${appointment.appointmentTime} with ${appointment.doctorName}.`); delivered = true; }
        if (!delivered) { await Appointment.updateOne({ _id: appointment._id }, { $set: { reminderClaimedAt: null } }); continue; }
        await Appointment.updateOne({ _id: appointment._id }, { $set: { reminderSentAt: new Date(), reminderClaimedAt: null } });
        await notify(appointment.patient._id, { type: 'appointment', title: 'Appointment reminder', message: `Your appointment is on ${appointment.appointmentDate} at ${appointment.appointmentTime}.`, link: '/my-appointments' });
        sent += 1;
      } catch (error) { await Appointment.updateOne({ _id: appointment._id }, { $set: { reminderClaimedAt: null } }); console.error(`Reminder delivery failed for appointment ${appointment._id}:`, error.message); }
    }
    return { checked: appointments.length, sent };
  } finally { running = false; }
};

const startReminderWorker = () => {
  if (intervalTimer) return;
  intervalTimer = setInterval(() => runDueReminders().catch((error) => console.error('Reminder worker error:', error.message)), 15 * 60 * 1000);
  intervalTimer.unref();
  initialTimer = setTimeout(() => runDueReminders().catch((error) => console.error('Reminder worker error:', error.message)), 5000);
  initialTimer.unref();
};

const stopReminderWorker = () => {
  if (intervalTimer) clearInterval(intervalTimer);
  if (initialTimer) clearTimeout(initialTimer);
  intervalTimer = null; initialTimer = null;
};

module.exports = { runDueReminders, startReminderWorker, stopReminderWorker };
