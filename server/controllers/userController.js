const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const AuditLog = require('../models/AuditLog');
const EmailChangeOtp = require('../models/EmailChangeOtp');
const AuthSession = require('../models/AuthSession');
const AiConversation = require('../models/AiConversation');
const crypto = require('crypto');
const { sendSecurityOtp } = require('../lib/mailer');
const { publicUser } = require('./authController');
const { availableSlots, nextAssignment, validDate, today } = require('../lib/availability');
const { audit } = require('../lib/activity');
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const strongPassword = (password) => typeof password === 'string' && password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
const hashValue = (value) => crypto.createHmac('sha256', process.env.OTP_SECRET || process.env.JWT_SECRET).update(String(value)).digest('hex');

// Only a bitmap data URL is ever accepted, so nothing that could be rendered as
// markup can reach an img src. The cap sits under the 100kb JSON body limit.
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_AVATAR = 80000;

const updateMe = async (req, res) => {
  try {
    const { name, email, phone, age, gender, address, designation, avatar } = req.body;
    if (typeof name !== 'string' || typeof email !== 'string' || !name.trim() || !email.trim()) return res.status(400).json({ success: false, message: 'Name and email are required.' });
    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    if (normalizedEmail !== req.user.email) return res.status(409).json({ success: false, message: 'Use the verified email-change flow to update your email address.' });
    const normalizedAge = age === '' || age == null ? null : Number(age);
    if (normalizedAge !== null && (!Number.isFinite(normalizedAge) || normalizedAge < 1 || normalizedAge > 120)) {
      return res.status(400).json({ success: false, message: 'Age must be between 1 and 120.' });
    }
    const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } });
    if (duplicate) return res.status(409).json({ success: false, message: 'Email is already used.' });

    const updates = {
      name: name.trim(),
      email: normalizedEmail,
      phone: (phone || '').trim(),
      age: normalizedAge,
      gender: gender || '',
      address: (address || '').trim(),
      designation: String(designation || '').trim().slice(0, 80),
    };
    if (avatar !== undefined) {
      const picture = String(avatar || '');
      if (picture && (picture.length > MAX_AVATAR || !AVATAR_PATTERN.test(picture))) {
        return res.status(400).json({ success: false, message: 'Choose a smaller JPEG, PNG or WebP picture.' });
      }
      updates.avatar = picture;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated successfully.', user: publicUser(user) });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ success: false, message: 'Enter valid profile information.' });
    res.status(500).json({ success: false, message: 'Unable to update profile.' });
  }
};

const adminStats = async (req, res) => {
  const [patients, doctors, receptionists, appointments] = await Promise.all([
    User.countDocuments({ role: 'patient' }),
    User.countDocuments({ role: 'doctor', isActive: true }),
    User.countDocuments({ role: 'receptionist', isActive: true }),
    Appointment.countDocuments(),
  ]);
  res.json({ success: true, stats: { patients, doctors, receptionists, appointments } });
};

const listUsers = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100); const filter = {};
  if (req.query.role) filter.role = req.query.role; if (req.query.active === 'true') filter.isActive = true; if (req.query.active === 'false') filter.isActive = false;
  if (req.query.search) { const regex = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ name: regex }, { email: regex }, { phone: regex }]; }
  const [users, total] = await Promise.all([User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User.countDocuments(filter)]);
  res.json({ success: true, users: users.map(publicUser), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

const createStaff = async (req, res) => {
  try {
    const { name, email, password, phone, role, specialty, experience, location, fee } = req.body;
    if (!['doctor', 'receptionist'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be doctor or receptionist.' });
    }
    if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    if (!validEmail(email.trim().toLowerCase())) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    if (!strongPassword(password)) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
    if (await User.findOne({ email: email.trim().toLowerCase() })) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 10),
      phone: (phone || '').trim(),
      role,
      specialty: role === 'doctor' ? (specialty || '').trim() : '',
      experience: role === 'doctor' ? (experience || '').trim() : '',
      location: role === 'doctor' ? (location || '').trim() : '',
      fee: role === 'doctor' ? Number(fee || 0) : 0,
    });
    res.status(201).json({ success: true, message: `${role} account created.`, user: publicUser(user) });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ success: false, message: 'Unable to create account.' });
  }
};

const updateStaff = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'specialty', 'experience', 'location', 'fee', 'isActive'];
    const updates = {};
    allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    if (req.body.password) {
      if (!strongPassword(req.body.password)) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
      updates.password = await bcrypt.hash(req.body.password, 10);
      updates.tokenVersion = (await User.findById(req.params.id).select('+tokenVersion'))?.tokenVersion + 1 || 1;
    }
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user || !['doctor', 'receptionist'].includes(user.role)) return res.status(404).json({ success: false, message: 'Staff account not found.' });
    res.json({ success: true, message: 'Staff account updated.', user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update staff.' });
  }
};

const deactivateStaff = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !['doctor', 'receptionist'].includes(user.role)) return res.status(404).json({ success: false, message: 'Staff account not found.' });
  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, message: user.isActive ? 'Account activated.' : 'Account deactivated.', user: publicUser(user) });
};

const publicDoctors = async (req, res) => {
  const doctors = await User.find({ role: 'doctor', isActive: true }).select('-password').sort({ name: 1 });
  res.json({ success: true, doctors: doctors.map(publicUser) });
};

const doctorAvailability = async (req, res) => {
  try {
    const date = String(req.query.date || '');
    if (!validDate(date) || date < today()) return res.status(400).json({ success: false, message: 'Choose today or a future valid date.' });
    const doctor = await User.findOne({ _id: req.params.id, role: 'doctor', isActive: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    const slots = await availableSlots(doctor, date);
    const next = await nextAssignment(doctor, date);
    res.json({ success: true, date, timezone: doctor.availability?.timezone || 'Asia/Dhaka', slots, next });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
    res.status(500).json({ success: false, message: 'Unable to load availability.' });
  }
};

const updateAvailability = async (req, res) => {
  try {
    const { timezone = 'Asia/Dhaka', slotDuration = 60, weekly = [], unavailableDates = [], overrides = [] } = req.body;
    const duration = Number(slotDuration);
    const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
    if (!Number.isInteger(duration) || duration < 1 || duration > 240) return res.status(400).json({ success: false, message: 'Consultation length must be 1 to 240 minutes.' });
    if (!Array.isArray(weekly) || weekly.some((item) => !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || !validTime(item.start) || !validTime(item.end) || item.start >= item.end)) {
      return res.status(400).json({ success: false, message: 'Enter a valid weekly schedule.' });
    }
    if (!Array.isArray(unavailableDates) || unavailableDates.some((date) => !validDate(date))) return res.status(400).json({ success: false, message: 'Unavailable dates must use YYYY-MM-DD.' });
    const validBreaks = (breaks = []) => Array.isArray(breaks) && breaks.every((item) => validTime(item.start) && validTime(item.end) && item.start < item.end);
    if (!Array.isArray(overrides) || overrides.some((item) => !validDate(item.date) || (item.enabled !== false && (!validTime(item.start) || !validTime(item.end) || item.start >= item.end || !validBreaks(item.breaks))))) return res.status(400).json({ success: false, message: 'Enter valid schedule exceptions and breaks.' });
    req.user.availability = { timezone: String(timezone).trim() || 'Asia/Dhaka', slotDuration: duration, weekly, unavailableDates: [...new Set(unavailableDates)], overrides };
    await req.user.save();
    audit(req, 'availability.updated', 'User', req.user._id, { slotDuration: duration });
    res.json({ success: true, message: 'Availability updated.', availability: req.user.availability });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to update availability.' });
  }
};

const auditLogs = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const filter = req.query.action ? { action: String(req.query.action) } : {};
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'name email role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

const requestEmailChange = async (req, res) => {
  try {
    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
    if (!validEmail(newEmail) || newEmail === req.user.email) return res.status(400).json({ success: false, message: 'Enter a different valid email address.' });
    if (await User.findOne({ email: newEmail })) return res.status(409).json({ success: false, message: 'Email is already used.' });
    const user = await User.findById(req.user._id);
    if (!req.body.password || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Password is incorrect.' });
    const otp = String(crypto.randomInt(100000, 1000000)); const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await EmailChangeOtp.findOneAndUpdate({ user: user._id }, { user: user._id, newEmail, otpHash: hashValue(otp), attempts: 0, expiresAt }, { upsert: true, returnDocument: 'after' });
    try { await sendSecurityOtp(newEmail, otp, 'email-change'); }
    catch (error) { await EmailChangeOtp.deleteOne({ user: user._id }); return res.status(503).json({ success: false, message: 'Unable to send the verification email.' }); }
    res.json({ success: true, expiresAt, message: 'A verification code was sent to the new email address.' });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to start the email change.' }); }
};

const verifyEmailChange = async (req, res) => {
  const record = await EmailChangeOtp.findOne({ user: req.user._id }); const otp = String(req.body.otp || '').trim();
  if (!record || record.expiresAt <= new Date()) return res.status(410).json({ success: false, message: 'Verification code expired.' });
  if (record.attempts >= 5) return res.status(429).json({ success: false, message: 'Too many incorrect attempts.' });
  if (!/^\d{6}$/.test(otp) || record.otpHash !== hashValue(otp)) { record.attempts += 1; await record.save(); return res.status(400).json({ success: false, message: 'Incorrect verification code.' }); }
  if (await User.findOne({ email: record.newEmail, _id: { $ne: req.user._id } })) return res.status(409).json({ success: false, message: 'Email is already used.' });
  const user = await User.findById(req.user._id).select('+tokenVersion'); user.email = record.newEmail; user.tokenVersion += 1; await user.save();
  await Promise.all([EmailChangeOtp.deleteOne({ user: user._id }), AuthSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() })]);
  await audit(req, 'account.email_changed', 'User', user._id, {});
  res.json({ success: true, message: 'Email changed. Please log in again.' });
};

const exportAuditLogs = async (req, res) => {
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action);
  if (req.query.from || req.query.to) { filter.createdAt = {}; if (req.query.from) filter.createdAt.$gte = new Date(req.query.from); if (req.query.to) filter.createdAt.$lte = new Date(req.query.to); }
  const logs = await AuditLog.find(filter).populate('actor', 'name email role').sort({ createdAt: -1 }).limit(10000);
  const safe = (value) => { let text = String(value ?? '').replace(/"/g, '""'); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text}"`; };
  const rows = [['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID', 'IP'].map(safe).join(',')];
  logs.forEach((log) => rows.push([log.createdAt.toISOString(), log.actor?.email || 'System', log.actor?.role || '', log.action, log.entity, log.entityId, log.ip].map(safe).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="docflow-audit-${new Date().toISOString().slice(0, 10)}.csv"`); res.send(`\uFEFF${rows.join('\n')}`);
};

const exportMyData = async (req, res) => {
  const appointments = await Appointment.find({ patient: req.user._id }).populate('doctor', 'name specialty').lean();
  const user = await User.findById(req.user._id).select('-password -loginAttempts -lockUntil -tokenVersion').lean();
  res.json({ success: true, exportedAt: new Date(), data: { profile: user, appointments } });
};

const deleteMyAccount = async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (!req.body.password || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Password is incorrect.' });
  const originalId = user._id;
  user.name = 'Deleted user'; user.email = `deleted-${user._id}-${Date.now()}@redacted.docflow.local`; user.phone = ''; user.address = ''; user.gender = ''; user.isActive = false; user.tokenVersion += 1;
  await user.save(); await AuthSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  // Assistant chats are not clinical records, so they go with the account.
  await AiConversation.deleteMany({ user: user._id });
  await audit(req, 'account.deleted', 'User', originalId, { retainedRecords: 'Appointments retained under healthcare record policy' });
  res.json({ success: true, message: 'Account access and personal profile data were removed. Clinical records remain retained as required.' });
};

const updateNotificationPreferences = async (req, res) => {
  const reminderHoursBefore = Number(req.body.reminderHoursBefore);
  if (!Number.isInteger(reminderHoursBefore) || reminderHoursBefore < 1 || reminderHoursBefore > 168) return res.status(400).json({ success: false, message: 'Reminder time must be between 1 and 168 hours.' });
  if (req.body.smsReminders === true && !/^\+[1-9]\d{7,14}$/.test(String(req.user.phone || ''))) return res.status(400).json({ success: false, message: 'Add a phone number in international E.164 format before enabling SMS.' });
  req.user.notificationPreferences = { emailReminders: req.body.emailReminders !== false, smsReminders: req.body.smsReminders === true, smsConsentAt: req.body.smsReminders === true ? (req.user.notificationPreferences?.smsConsentAt || new Date()) : null, reminderHoursBefore }; await req.user.save();
  res.json({ success: true, message: 'Notification preferences updated.', notificationPreferences: req.user.notificationPreferences });
};

module.exports = { updateMe, adminStats, listUsers, createStaff, updateStaff, deactivateStaff, publicDoctors, doctorAvailability, updateAvailability, auditLogs, requestEmailChange, verifyEmailChange, exportAuditLogs, exportMyData, deleteMyAccount, updateNotificationPreferences };
