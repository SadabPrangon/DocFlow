const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const QueueState = require('../models/QueueState');
const { nextAssignment, validDate, today, appointmentDateTime } = require('../lib/availability');
const { notify, audit } = require('../lib/activity');
const { runDueReminders } = require('../services/reminderService');

const validId = (value) => mongoose.isObjectIdOrHexString(value);
const queueStateId = (doctorId, appointmentDate) => `${doctorId}:${appointmentDate}`;
const bookingKey = (patientId, doctorId, appointmentDate) => `${patientId}:${doctorId}:${appointmentDate}`;
const slotKey = (doctorId, appointmentDate, appointmentTime) => `${doctorId}:${appointmentDate}:${appointmentTime}`;

const ensureQueueState = async (doctorId, appointmentDate) => {
  const _id = queueStateId(doctorId, appointmentDate);
  let state = await QueueState.findById(_id);
  if (state) return state;
  const [last, current] = await Promise.all([
    Appointment.findOne({ doctor: doctorId, appointmentDate, queueNumber: { $ne: null } }).sort({ queueNumber: -1 }),
    Appointment.findOne({ doctor: doctorId, appointmentDate, status: 'Approved', isCurrentServing: true }),
  ]);
  try {
    state = await QueueState.create({ _id, doctor: doctorId, appointmentDate, lastQueueNumber: last?.queueNumber || 0, currentAppointment: current?._id || null });
  } catch (error) {
    if (error.code !== 11000) throw error;
    state = await QueueState.findById(_id);
  }
  return state;
};

const enrichQueue = async (appointment) => {
  const obj = appointment.toObject ? appointment.toObject() : appointment;
  let currentServing = null;
  if (obj.status === 'Approved' && obj.queueNumber != null) {
    const current = await Appointment.findOne({
      doctor: obj.doctor?._id || obj.doctor,
      appointmentDate: obj.appointmentDate,
      status: 'Approved',
      isCurrentServing: true,
    }).sort({ queueNumber: 1 });
    currentServing = current?.queueNumber || null;
  }
  const peopleBeforeYou = currentServing != null && obj.queueNumber != null
    ? Math.max(obj.queueNumber - currentServing - 1, 0)
    : 0;
  return { ...obj, currentServing, peopleBeforeYou, estimatedWait: peopleBeforeYou * 5 };
};

const createAppointment = async (req, res) => {
  try {
    const { doctorId, appointmentDate, reason, paymentMethod = 'cash' } = req.body;
    if (!validId(doctorId)) return res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
    const doctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    if (!validDate(appointmentDate) || appointmentDate < today()) return res.status(400).json({ success: false, message: 'Choose today or a future valid date.' });
    if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ success: false, message: 'Date and reason are required.' });
    if (reason.trim().length > 1000) return res.status(400).json({ success: false, message: 'Reason must be 1000 characters or less.' });
    if (!['cash', 'online'].includes(paymentMethod)) return res.status(400).json({ success: false, message: 'Choose a valid payment method.' });

    // The patient asks for a date; the serial and its time come from the
    // doctor's own schedule, so nobody picks a time the doctor is not there for.
    const next = await nextAssignment(doctor, appointmentDate);
    if (!next) return res.status(409).json({ success: false, message: 'This doctor is fully booked on that date. Choose another date.' });
    const { serial, time: appointmentTime } = next;

    const existing = await Appointment.findOne({ patient: req.user._id, doctor: doctor._id, appointmentDate, status: { $in: ['Pending', 'Approved'] } });
    if (existing) return res.status(409).json({ success: false, message: 'You already have an active appointment with this doctor on this date.' });
    const queueState = await QueueState.findById(queueStateId(doctor._id, appointmentDate));
    if (queueState?.closed) return res.status(409).json({ success: false, message: queueState.statusReason || 'Bookings are closed for this doctor and date.' });

    const appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctor._id,
      doctorName: doctor.name,
      specialty: doctor.specialty || 'General Medicine',
      location: doctor.location || 'DocFlow Clinic',
      fee: doctor.fee || 0,
      appointmentDate,
      appointmentTime,
      serial,
      reason: reason.trim(),
      paymentMethod,
      bookingKey: bookingKey(req.user._id, doctor._id, appointmentDate),
      slotKey: slotKey(doctor._id, appointmentDate, appointmentTime),
    });
    await notify(req.user._id, { type: 'appointment', title: 'Appointment requested', message: `You are serial #${serial} with ${doctor.name} on ${appointmentDate}, at about ${appointmentTime}. It is awaiting approval.`, link: '/my-appointments' });
    await audit(req, 'appointment.created', 'Appointment', appointment._id, { doctor: doctor._id, appointmentDate, appointmentTime, serial });
    res.status(201).json({ success: true, message: `Booked. You are serial #${serial}, at about ${appointmentTime}.`, appointment });
  } catch (error) {
    console.error('Create appointment error:', error);
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'This appointment is no longer available. Choose another date or time.' });
    if (error.name === 'CastError' || error.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Enter valid appointment information.' });
    res.status(500).json({ success: false, message: 'Unable to book appointment.' });
  }
};

const patientAppointments = async (req, res) => {
  const items = await Appointment.find({ patient: req.user._id }).populate('doctor', 'name specialty').sort({ createdAt: -1 });
  res.json({ success: true, appointments: await Promise.all(items.map(enrichQueue)) });
};

const allAppointments = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100); const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (validId(req.query.doctor)) filter.doctor = req.query.doctor;
  if (req.query.dateFrom || req.query.dateTo) { filter.appointmentDate = {}; if (req.query.dateFrom) filter.appointmentDate.$gte = req.query.dateFrom; if (req.query.dateTo) filter.appointmentDate.$lte = req.query.dateTo; }
  if (req.query.search) { const regex = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); const patients = await User.find({ $or: [{ name: regex }, { email: regex }] }).distinct('_id'); filter.$or = [{ patient: { $in: patients } }, { doctorName: regex }, { specialty: regex }]; }
  const [items, total] = await Promise.all([Appointment.find(filter).populate('patient', 'name email phone').populate('doctor', 'name specialty').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Appointment.countDocuments(filter)]);
  res.json({ success: true, appointments: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

const doctorAppointments = async (req, res) => {
  const items = await Appointment.find({ doctor: req.user._id }).populate('patient', 'name email phone age gender').sort({ appointmentDate: 1, queueNumber: 1, createdAt: 1 });
  res.json({ success: true, appointments: items });
};

const getById = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findById(req.params.id).populate('patient', 'name email phone').populate('doctor', 'name specialty');
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  const permitted = req.user.role === 'admin' || req.user.role === 'receptionist' || String(appointment.patient._id) === String(req.user._id) || String(appointment.doctor._id) === String(req.user._id);
  if (!permitted) return res.status(403).json({ success: false, message: 'Access denied.' });
  res.json({ success: true, appointment: await enrichQueue(appointment) });
};

const approve = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  if (appointment.status !== 'Pending') return res.status(400).json({ success: false, message: 'Only pending appointments can be approved.' });

  const state = await ensureQueueState(appointment.doctor, appointment.appointmentDate);
  if (state.closed) return res.status(409).json({ success: false, message: state.statusReason || 'This queue is closed.' });
  const numberedState = await QueueState.findByIdAndUpdate(state._id, { $inc: { lastQueueNumber: 1 } }, { returnDocument: 'after' });
  appointment.queueNumber = numberedState.lastQueueNumber;
  const claimedState = await QueueState.findOneAndUpdate(
    { _id: state._id, currentAppointment: null },
    { $set: { currentAppointment: appointment._id } },
    { returnDocument: 'after' }
  );
  appointment.status = 'Approved';
  appointment.queueStatus = claimedState ? 'Current' : 'Waiting';
  appointment.isCurrentServing = Boolean(claimedState);
  await appointment.save();
  await notify(appointment.patient, { type: 'queue', title: 'Appointment approved', message: `Your appointment was approved. Queue #${appointment.queueNumber} has been assigned.`, link: `/live-queue/${appointment._id}` });
  await audit(req, 'appointment.approved', 'Appointment', appointment._id, { queueNumber: appointment.queueNumber });
  const updated = await Appointment.findById(appointment._id).populate('patient', 'name email phone').populate('doctor', 'name specialty');
  res.json({ success: true, message: `Approved. Queue #${appointment.queueNumber} assigned.`, appointment: updated });
};

const advanceQueue = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const current = await Appointment.findById(req.params.id);
  if (!current) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  if (!current.isCurrentServing) return res.status(400).json({ success: false, message: 'This patient is not currently being served.' });
  const state = await ensureQueueState(current.doctor, current.appointmentDate);
  if (state.paused || state.closed) return res.status(409).json({ success: false, message: state.statusReason || (state.closed ? 'Queue is closed.' : 'Queue is paused.') });

  current.isCurrentServing = false;
  current.queueStatus = req.body.action === 'skip' ? 'Skipped' : 'Completed';
  if (req.body.action !== 'skip') { current.status = 'Completed'; current.bookingKey = undefined; current.slotKey = undefined; }
  if (req.body.doctorNotes !== undefined) current.doctorNotes = req.body.doctorNotes;
  if (req.body.prescription !== undefined) current.prescription = req.body.prescription;
  await current.save();

  const next = await Appointment.findOne({
    doctor: current.doctor,
    appointmentDate: current.appointmentDate,
    status: 'Approved',
    queueStatus: 'Waiting',
    queueNumber: { $gt: current.queueNumber },
  }).sort({ queueNumber: 1 });
  if (next) {
    next.queueStatus = 'Current';
    next.isCurrentServing = true;
    await next.save();
    await notify(next.patient, { type: 'queue', title: 'It is your turn', message: `Queue #${next.queueNumber} is now being served.`, link: `/live-queue/${next._id}` });
  }
  await QueueState.findByIdAndUpdate(
    queueStateId(current.doctor, current.appointmentDate),
    { $set: { currentAppointment: next?._id || null } },
    { upsert: true }
  );
  await notify(current.patient, { type: 'queue', title: req.body.action === 'skip' ? 'Queue position skipped' : 'Consultation completed', message: req.body.action === 'skip' ? 'Your queue position was skipped. Please contact reception for help.' : 'Your consultation has been completed.', link: '/my-appointments' });
  await audit(req, `queue.${req.body.action === 'skip' ? 'skipped' : 'completed'}`, 'Appointment', current._id, { next: next?._id || null });
  res.json({ success: true, message: next ? `Queue advanced to #${next.queueNumber}.` : 'Queue completed for this doctor and date.' });
};

const doctorUpdate = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findOne({ _id: req.params.id, doctor: req.user._id });
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  appointment.doctorNotes = req.body.doctorNotes ?? appointment.doctorNotes;
  appointment.prescription = req.body.prescription ?? appointment.prescription;
  await appointment.save();
  res.json({ success: true, message: 'Consultation notes saved.', appointment });
};

const cancel = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  if (!['Pending', 'Approved'].includes(appointment.status)) return res.status(400).json({ success: false, message: 'This appointment cannot be cancelled.' });
  if (appointment.isCurrentServing) return res.status(400).json({ success: false, message: 'Current consultation cannot be cancelled.' });
  const scheduledAt = appointmentDateTime(appointment.appointmentDate, appointment.appointmentTime);
  const cutoffHours = Math.max(Number(process.env.CANCELLATION_CUTOFF_HOURS || 2), 0);
  if (scheduledAt && scheduledAt.getTime() - Date.now() < cutoffHours * 60 * 60 * 1000) return res.status(409).json({ success: false, message: `Appointments must be cancelled at least ${cutoffHours} hours before the scheduled time.` });
  appointment.status = 'Cancelled';
  appointment.queueStatus = 'Skipped';
  appointment.bookingKey = undefined;
  appointment.slotKey = undefined;
  appointment.cancelledAt = new Date();
  appointment.cancellationReason = String(req.body.reason || '').trim().slice(0, 500);
  await appointment.save();
  await notify(appointment.patient, { type: 'appointment', title: 'Appointment cancelled', message: `Your ${appointment.appointmentDate} appointment has been cancelled.`, link: '/my-appointments' });
  await audit(req, 'appointment.cancelled', 'Appointment', appointment._id, { reason: appointment.cancellationReason });
  res.json({ success: true, message: 'Appointment cancelled.' });
};

const reschedule = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
    const appointment = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (!['Pending', 'Approved'].includes(appointment.status) || appointment.isCurrentServing) return res.status(400).json({ success: false, message: 'This appointment cannot be rescheduled.' });
    const appointmentDate = String(req.body.appointmentDate || '');
    if (!validDate(appointmentDate) || appointmentDate < today()) return res.status(400).json({ success: false, message: 'Choose today or a future valid date.' });
    const doctor = await User.findOne({ _id: appointment.doctor, role: 'doctor', isActive: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor is unavailable.' });
    const next = await nextAssignment(doctor, appointmentDate, appointment._id);
    if (!next) return res.status(409).json({ success: false, message: 'This doctor is fully booked on that date. Choose another date.' });
    const { serial, time: appointmentTime } = next;
    const duplicate = await Appointment.findOne({ _id: { $ne: appointment._id }, patient: req.user._id, doctor: doctor._id, appointmentDate, status: { $in: ['Pending', 'Approved'] } });
    if (duplicate) return res.status(409).json({ success: false, message: 'You already have an active appointment with this doctor on this date.' });
    const previous = { date: appointment.appointmentDate, time: appointment.appointmentTime };
    appointment.appointmentDate = appointmentDate;
    appointment.appointmentTime = appointmentTime;
    appointment.serial = serial;
    appointment.status = 'Pending';
    appointment.queueNumber = null;
    appointment.queueStatus = 'Waiting';
    appointment.isCurrentServing = false;
    appointment.bookingKey = bookingKey(req.user._id, doctor._id, appointmentDate);
    appointment.slotKey = slotKey(doctor._id, appointmentDate, appointmentTime);
    appointment.rescheduleCount += 1;
    await appointment.save();
    await notify(appointment.patient, { type: 'appointment', title: 'Appointment rescheduled', message: `You are now serial #${serial} on ${appointmentDate}, at about ${appointmentTime}. It is awaiting approval.`, link: '/my-appointments' });
    await audit(req, 'appointment.rescheduled', 'Appointment', appointment._id, { previous, appointmentDate, appointmentTime });
    res.json({ success: true, message: `Moved to ${appointmentDate}. You are serial #${serial}, at about ${appointmentTime}.`, appointment });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'This date or time conflicts with another appointment.' });
    if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ success: false, message: 'Enter valid appointment information.' });
    res.status(500).json({ success: false, message: 'Unable to reschedule appointment.' });
  }
};

const rejoinQueue = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  if (appointment.status !== 'Approved' || appointment.queueStatus !== 'Skipped') return res.status(400).json({ success: false, message: 'Only a skipped appointment can rejoin the queue.' });
  const state = await ensureQueueState(appointment.doctor, appointment.appointmentDate);
  if (state.paused || state.closed) return res.status(409).json({ success: false, message: state.statusReason || 'Queue is not accepting patients.' });
  const numberedState = await QueueState.findByIdAndUpdate(state._id, { $inc: { lastQueueNumber: 1 } }, { returnDocument: 'after' });
  appointment.queueNumber = numberedState.lastQueueNumber;
  const claimed = await QueueState.findOneAndUpdate({ _id: state._id, currentAppointment: null }, { currentAppointment: appointment._id }, { returnDocument: 'after' });
  appointment.queueStatus = claimed ? 'Current' : 'Waiting';
  appointment.isCurrentServing = Boolean(claimed);
  await appointment.save();
  await notify(appointment.patient, { type: 'queue', title: 'Queue rejoined', message: `You rejoined as queue #${appointment.queueNumber}.`, link: `/live-queue/${appointment._id}` });
  await audit(req, 'queue.rejoined', 'Appointment', appointment._id, { queueNumber: appointment.queueNumber });
  res.json({ success: true, message: `Patient rejoined as queue #${appointment.queueNumber}.`, appointment });
};

const markNoShow = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  if (req.user.role === 'doctor' && String(appointment.doctor) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'Access denied.' });
  const scheduledAt = appointmentDateTime(appointment.appointmentDate, appointment.appointmentTime);
  if (appointment.status !== 'Approved' || !scheduledAt || scheduledAt > new Date()) return res.status(400).json({ success: false, message: 'Only a past approved appointment can be marked as no-show.' });
  const wasCurrent = appointment.isCurrentServing;
  appointment.status = 'No-show'; appointment.queueStatus = 'Skipped'; appointment.isCurrentServing = false; appointment.bookingKey = undefined; appointment.slotKey = undefined; await appointment.save();
  if (wasCurrent) {
    const next = await Appointment.findOne({ doctor: appointment.doctor, appointmentDate: appointment.appointmentDate, status: 'Approved', queueStatus: 'Waiting', queueNumber: { $gt: appointment.queueNumber } }).sort({ queueNumber: 1 });
    if (next) { next.queueStatus = 'Current'; next.isCurrentServing = true; await next.save(); await notify(next.patient, { type: 'queue', title: 'It is your turn', message: `Queue #${next.queueNumber} is now being served.`, link: `/live-queue/${next._id}` }); }
    await QueueState.findByIdAndUpdate(queueStateId(appointment.doctor, appointment.appointmentDate), { currentAppointment: next?._id || null }, { upsert: true });
  }
  await notify(appointment.patient, { type: 'appointment', title: 'Marked as no-show', message: 'This appointment was marked as missed. Contact the clinic if this is incorrect.', link: '/my-appointments' });
  await audit(req, 'appointment.no_show', 'Appointment', appointment._id, {});
  res.json({ success: true, message: 'Appointment marked as no-show.', appointment });
};

const queueStatus = async (req, res) => {
  if (!validId(req.params.doctorId) || !validDate(req.params.date)) return res.status(400).json({ success: false, message: 'Invalid queue identity.' });
  const state = await ensureQueueState(req.params.doctorId, req.params.date);
  res.json({ success: true, queue: state });
};
const controlQueue = async (req, res) => {
  if (!validId(req.params.doctorId) || !validDate(req.params.date)) return res.status(400).json({ success: false, message: 'Invalid queue identity.' });
  if (req.user.role === 'doctor' && String(req.params.doctorId) !== String(req.user._id)) return res.status(403).json({ success: false, message: 'Access denied.' });
  const action = String(req.body.action || ''); if (!['pause', 'resume', 'close', 'reopen'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid queue action.' });
  const state = await ensureQueueState(req.params.doctorId, req.params.date);
  if (action === 'pause') state.paused = true;
  if (action === 'resume') state.paused = false;
  if (action === 'close') { state.closed = true; state.paused = true; }
  if (action === 'reopen') { state.closed = false; state.paused = false; }
  state.statusReason = ['resume', 'reopen'].includes(action) ? '' : String(req.body.reason || '').trim().slice(0, 300);
  await state.save(); await audit(req, `queue.${action}`, 'QueueState', state._id, { reason: state.statusReason });
  res.json({ success: true, message: `Queue ${action}d.`, queue: state });
};
const runReminders = async (req, res) => res.json({ success: true, ...(await runDueReminders()) });

const calendar = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  const permitted = ['admin', 'receptionist'].includes(req.user.role) || String(appointment.patient) === String(req.user._id) || String(appointment.doctor) === String(req.user._id);
  if (!permitted) return res.status(403).json({ success: false, message: 'Access denied.' });
  const start = appointmentDateTime(appointment.appointmentDate, appointment.appointmentTime); if (!start) return res.status(400).json({ success: false, message: 'Appointment time is invalid.' });
  const format = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); const escape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const end = new Date(start.getTime() + 60 * 60 * 1000); const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DocFlow//Appointments//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${appointment._id}@docflow`, `DTSTAMP:${format(new Date())}`, `DTSTART:${format(start)}`, `DTEND:${format(end)}`, `SUMMARY:${escape(`Appointment with ${appointment.doctorName}`)}`, `LOCATION:${escape(appointment.location)}`, `DESCRIPTION:${escape(appointment.reason)}`, 'END:VEVENT', 'END:VCALENDAR'];
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="docflow-${appointment._id}.ics"`); res.send(lines.join('\r\n'));
};

const reassignDoctor = async (req, res) => {
  try {
    if (!validId(req.params.id) || !validId(req.body.doctorId)) return res.status(400).json({ success: false, message: 'Invalid appointment or doctor ID.' });
    const appointment = await Appointment.findById(req.params.id); if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (!['Pending', 'Approved'].includes(appointment.status) || appointment.isCurrentServing) return res.status(400).json({ success: false, message: 'This appointment cannot be reassigned.' });
    const doctor = await User.findOne({ _id: req.body.doctorId, role: 'doctor', isActive: true }); if (!doctor) return res.status(404).json({ success: false, message: 'Replacement doctor not found.' });
    // The replacement doctor keeps their own grid, so the patient takes the
    // next free place in it rather than the time they held with the old doctor.
    const next = await nextAssignment(doctor, appointment.appointmentDate, appointment._id);
    if (!next) return res.status(409).json({ success: false, message: 'Replacement doctor is fully booked on that date.' });
    const { serial, time: appointmentTime } = next;
    const previousDoctor = appointment.doctor; appointment.doctor = doctor._id; appointment.doctorName = doctor.name; appointment.specialty = doctor.specialty || 'General Medicine'; appointment.location = doctor.location || appointment.location; appointment.fee = doctor.fee || 0; appointment.appointmentTime = appointmentTime; appointment.serial = serial; appointment.status = 'Pending'; appointment.queueNumber = null; appointment.queueStatus = 'Waiting'; appointment.isCurrentServing = false; appointment.bookingKey = bookingKey(appointment.patient, doctor._id, appointment.appointmentDate); appointment.slotKey = slotKey(doctor._id, appointment.appointmentDate, appointmentTime); await appointment.save();
    await notify(appointment.patient, { type: 'appointment', title: 'Doctor changed', message: `Your appointment was reassigned to ${doctor.name} and is awaiting approval.`, link: '/my-appointments' }); await audit(req, 'appointment.doctor_reassigned', 'Appointment', appointment._id, { previousDoctor, doctor: doctor._id });
    res.json({ success: true, message: 'Appointment reassigned.', appointment });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ success: false, message: 'The reassigned appointment conflicts with another booking.' }); res.status(500).json({ success: false, message: 'Unable to reassign appointment.' }); }
};

const reports = async (req, res) => {
  const match = {}; if (req.query.from || req.query.to) { match.appointmentDate = {}; if (req.query.from) match.appointmentDate.$gte = req.query.from; if (req.query.to) match.appointmentDate.$lte = req.query.to; }
  const [byStatus, byDoctor, revenue] = await Promise.all([Appointment.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]), Appointment.aggregate([{ $match: match }, { $group: { _id: '$doctor', doctorName: { $first: '$doctorName' }, appointments: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } } } }, { $sort: { appointments: -1 } }]), Appointment.aggregate([{ $match: { ...match, paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: '$fee' }, count: { $sum: 1 } } }])]);
  res.json({ success: true, report: { byStatus, byDoctor, revenue: revenue[0] || { total: 0, count: 0 } } });
};

const exportAppointments = async (req, res) => {
  const items = await Appointment.find().populate('patient', 'name email').sort({ appointmentDate: -1 }).limit(10000); const safe = (value) => { let text = String(value ?? '').replace(/"/g, '""'); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text}"`; }; const rows = [['Date', 'Time', 'Patient', 'Patient Email', 'Doctor', 'Specialty', 'Status', 'Payment', 'Fee'].map(safe).join(',')]; items.forEach((item) => rows.push([item.appointmentDate, item.appointmentTime, item.patient?.name, item.patient?.email, item.doctorName, item.specialty, item.status, item.paymentStatus, item.fee].map(safe).join(','))); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="docflow-appointments.csv"'); res.send(`\uFEFF${rows.join('\n')}`);
};

module.exports = { createAppointment, patientAppointments, allAppointments, doctorAppointments, getById, approve, advanceQueue, doctorUpdate, cancel, reschedule, rejoinQueue, markNoShow, queueStatus, controlQueue, runReminders, calendar, reassignDoctor, reports, exportAppointments };
