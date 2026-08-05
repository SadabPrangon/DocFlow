const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const Message = require('../models/Message');
const { notify, audit } = require('../lib/activity');

const validId = (value) => mongoose.isObjectIdOrHexString(value);
const appointmentAccess = async (appointmentId, user, doctorOnly = false) => {
  if (!validId(appointmentId)) return null;
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return null;
  const isDoctor = user.role === 'doctor' && String(appointment.doctor) === String(user._id);
  const isPatient = !doctorOnly && user.role === 'patient' && String(appointment.patient) === String(user._id);
  return isDoctor || isPatient ? appointment : null;
};

const upsertRecord = async (req, res) => {
  try {
    const appointment = await appointmentAccess(req.params.appointmentId, req.user, true);
    if (!appointment) return res.status(404).json({ success: false, message: 'Assigned appointment not found.' });
    if (!String(req.body.diagnosis || '').trim()) return res.status(400).json({ success: false, message: 'Diagnosis is required.' });
    const data = { patient: appointment.patient, doctor: appointment.doctor, appointment: appointment._id, diagnosis: String(req.body.diagnosis).trim(), symptoms: req.body.symptoms || [], vitals: req.body.vitals || {}, allergies: req.body.allergies || [], labResults: req.body.labResults || [], documents: req.body.documents || [], clinicalNotes: String(req.body.clinicalNotes || '').trim() };
    const record = await MedicalRecord.findOneAndUpdate({ appointment: appointment._id }, data, { upsert: true, returnDocument: 'after', runValidators: true });
    await audit(req, 'medical_record.saved', 'MedicalRecord', record._id, { appointment: appointment._id });
    res.json({ success: true, message: 'Medical record saved.', record });
  } catch (error) { if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: error.message }); res.status(500).json({ success: false, message: 'Unable to save medical record.' }); }
};

const upsertPrescription = async (req, res) => {
  try {
    const appointment = await appointmentAccess(req.params.appointmentId, req.user, true);
    if (!appointment) return res.status(404).json({ success: false, message: 'Assigned appointment not found.' });
    if (!Array.isArray(req.body.medicines) || !req.body.medicines.length) return res.status(400).json({ success: false, message: 'Add at least one medicine.' });
    const prescription = await Prescription.findOneAndUpdate({ appointment: appointment._id }, { patient: appointment.patient, doctor: appointment.doctor, appointment: appointment._id, medicines: req.body.medicines, advice: req.body.advice || '', followUpDate: req.body.followUpDate || '', status: req.body.status || 'Active' }, { upsert: true, returnDocument: 'after', runValidators: true });
    await notify(appointment.patient, { type: 'appointment', title: 'Prescription updated', message: 'Your doctor added a structured prescription.', link: '/medical-records' });
    await audit(req, 'prescription.saved', 'Prescription', prescription._id, { appointment: appointment._id });
    res.json({ success: true, message: 'Prescription saved.', prescription });
  } catch (error) { if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: error.message }); res.status(500).json({ success: false, message: 'Unable to save prescription.' }); }
};

const myHistory = async (req, res) => {
  const patientId = req.user.role === 'patient' ? req.user._id : req.params.patientId;
  if (req.user.role === 'doctor' && !await Appointment.exists({ doctor: req.user._id, patient: patientId })) return res.status(403).json({ success: false, message: 'No care relationship with this patient.' });
  const [records, prescriptions] = await Promise.all([MedicalRecord.find({ patient: patientId }).populate('doctor', 'name specialty').populate('appointment', 'appointmentDate appointmentTime').sort({ createdAt: -1 }), Prescription.find({ patient: patientId }).populate('doctor', 'name specialty').populate('appointment', 'appointmentDate appointmentTime').sort({ createdAt: -1 })]);
  res.json({ success: true, records, prescriptions });
};

const appointmentClinical = async (req, res) => {
  const appointment = await appointmentAccess(req.params.appointmentId, req.user);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  const [record, prescription] = await Promise.all([MedicalRecord.findOne({ appointment: appointment._id }), Prescription.findOne({ appointment: appointment._id })]);
  res.json({ success: true, record, prescription });
};

const messages = async (req, res) => {
  const appointment = await appointmentAccess(req.params.appointmentId, req.user);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  await Message.updateMany({ appointment: appointment._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } });
  const items = await Message.find({ appointment: appointment._id }).populate('sender', 'name role').sort({ createdAt: 1 }).limit(500);
  res.json({ success: true, messages: items });
};

const sendMessage = async (req, res) => {
  const appointment = await appointmentAccess(req.params.appointmentId, req.user);
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
  const body = String(req.body.body || '').trim(); if (!body || body.length > 3000) return res.status(400).json({ success: false, message: 'Message must be 1 to 3000 characters.' });
  const message = await Message.create({ appointment: appointment._id, sender: req.user._id, body, readBy: [req.user._id] });
  const recipient = req.user.role === 'patient' ? appointment.doctor : appointment.patient;
  await notify(recipient, { type: 'appointment', title: 'New secure message', message: `${req.user.name} sent a message about an appointment.`, link: `/messages/${appointment._id}` });
  res.status(201).json({ success: true, message });
};

module.exports = { upsertRecord, upsertPrescription, myHistory, appointmentClinical, messages, sendMessage };
