const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RegistrationOtp = require('../models/RegistrationOtp');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const AuthSession = require('../models/AuthSession');
const MfaChallenge = require('../models/MfaChallenge');
const { sendRegistrationOtp, sendPasswordResetOtp, sendSecurityOtp } = require('../lib/mailer');

const OTP_LIFETIME_MS = 2 * 60 * 1000;
const REGISTRATION_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const hashValue = (value) => crypto.createHmac('sha256', process.env.OTP_SECRET || process.env.JWT_SECRET).update(String(value)).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const strongPassword = (password) => typeof password === 'string' && password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
const calculateAge = (dateOfBirth) => {
  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return { age, dob };
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  age: user.age || '',
  dateOfBirth: user.dateOfBirth || '',
  gender: user.gender || '',
  address: user.address || '',
  specialty: user.specialty || '',
  experience: user.experience || '',
  location: user.location || '',
  fee: user.fee || 0,
  isActive: user.isActive,
  availability: user.availability || null,
  mfaEnabled: Boolean(user.mfaEnabled),
  privacyConsent: user.privacyConsent || null,
  notificationPreferences: user.notificationPreferences || null,
});

const signToken = async (user, req) => {
  const jti = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await AuthSession.create({ user: user._id, jtiHash: hashValue(jti), device: String(req.headers['user-agent'] || 'Unknown device').slice(0, 250), ip: req.ip || '', expiresAt });
  return jwt.sign({ id: user._id, role: user.role, version: user.tokenVersion || 0, jti }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const requestRegistrationOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered.' });
    const previous = await RegistrationOtp.findOne({ email });
    if (previous?.expiresAt > new Date() && !previous.verified) {
      const retryAfter = Math.ceil((previous.expiresAt.getTime() - Date.now()) / 1000);
      return res.status(429).json({ success: false, message: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter, expiresAt: previous.expiresAt });
    }
    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
    await RegistrationOtp.findOneAndUpdate({ email }, {
      email, otpHash: hashValue(otp), expiresAt, attempts: 0, verified: false,
      registrationTokenHash: '', registrationTokenExpiresAt: null,
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    try {
      await sendRegistrationOtp(email, otp);
    } catch (mailError) {
      await RegistrationOtp.deleteOne({ email });
      console.error('OTP email error:', mailError);
      return res.status(503).json({ success: false, message: 'Unable to send the verification email. Check the email configuration and try again.' });
    }
    res.json({ success: true, message: 'A 6-digit verification code was sent to your email.', expiresAt });
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ success: false, message: 'Unable to send a verification code.' });
  }
};

const verifyRegistrationOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    if (!validEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: 'Enter the 6-digit verification code.' });
    const record = await RegistrationOtp.findOne({ email });
    if (!record || record.expiresAt <= new Date()) return res.status(410).json({ success: false, message: 'This verification code has expired. Request a new one.' });
    if (record.attempts >= 5) return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Request a new code.' });
    if (record.otpHash !== hashValue(otp)) {
      record.attempts += 1;
      await record.save();
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }
    const registrationToken = crypto.randomBytes(32).toString('hex');
    record.verified = true;
    record.registrationTokenHash = hashValue(registrationToken);
    record.registrationTokenExpiresAt = new Date(Date.now() + REGISTRATION_TOKEN_LIFETIME_MS);
    record.expiresAt = record.registrationTokenExpiresAt;
    await record.save();
    res.json({ success: true, message: 'Email verified.', registrationToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify the code.' });
  }
};

const completeRegistration = async (req, res) => {
  try {
    const { fullName, name, dateOfBirth, address, password, confirmPassword, registrationToken, privacyConsent } = req.body;
    const finalName = String(name || fullName || '').trim();
    const email = normalizeEmail(req.body.email);
    if (!finalName || !validEmail(email) || !dateOfBirth || !password || !confirmPassword || !registrationToken) {
      return res.status(400).json({ success: false, message: 'Complete all required fields.' });
    }
    if (!strongPassword(password)) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
    if (password !== confirmPassword) return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    const birth = calculateAge(dateOfBirth);
    if (!birth || birth.age < 1 || birth.age > 120) return res.status(400).json({ success: false, message: 'Enter a valid date of birth.' });
    const verification = await RegistrationOtp.findOne({ email, verified: true });
    if (!verification || verification.registrationTokenExpiresAt <= new Date() || verification.registrationTokenHash !== hashValue(registrationToken)) {
      return res.status(401).json({ success: false, message: 'Email verification has expired. Start registration again.' });
    }
    if (privacyConsent !== true) return res.status(400).json({ success: false, message: 'Accept the privacy notice to create an account.' });
    if (await User.findOne({ email })) return res.status(409).json({ success: false, message: 'Email already registered.' });
    const user = await User.create({
      name: finalName, email, dateOfBirth: birth.dob, age: birth.age,
      address: String(address || '').trim(), password: await bcrypt.hash(password, 10), role: 'patient',
      privacyConsent: { accepted: true, version: '2026-08-05', acceptedAt: new Date() },
    });
    await RegistrationOtp.deleteOne({ email });
    res.status(201).json({ success: true, message: 'Registration successful.', user: publicUser(user) });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Unable to register.' });
  }
};

const requestPasswordResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
    const user = await User.findOne({ email, isActive: true });
    const previous = await PasswordResetOtp.findOne({ email });
    if (previous?.expiresAt > new Date() && !previous.verified) {
      const retryAfter = Math.ceil((previous.expiresAt.getTime() - Date.now()) / 1000);
      return res.status(429).json({ success: false, message: `Please wait ${retryAfter} seconds before requesting another code.`, retryAfter, expiresAt: previous.expiresAt });
    }
    if (user) {
      const otp = String(crypto.randomInt(100000, 1000000));
      await PasswordResetOtp.findOneAndUpdate({ email }, {
        email, otpHash: hashValue(otp), expiresAt, attempts: 0, verified: false,
        resetTokenHash: '', resetTokenExpiresAt: null,
      }, { upsert: true, new: true, setDefaultsOnInsert: true });
      try { await sendPasswordResetOtp(email, otp); }
      catch (mailError) {
        await PasswordResetOtp.deleteOne({ email });
        console.error('Password reset email error:', mailError);
        return res.status(503).json({ success: false, message: 'Unable to send the reset email. Try again later.' });
      }
    }
    res.json({ success: true, message: 'If an active account exists for this email, a verification code has been sent.', expiresAt });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ success: false, message: 'Unable to start password recovery.' });
  }
};

const verifyPasswordResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    if (!validEmail(email) || !/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: 'Enter the 6-digit verification code.' });
    const record = await PasswordResetOtp.findOne({ email });
    if (!record || record.expiresAt <= new Date()) return res.status(410).json({ success: false, message: 'This verification code has expired. Request a new one.' });
    if (record.attempts >= 5) return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Request a new code.' });
    if (record.otpHash !== hashValue(otp)) {
      record.attempts += 1; await record.save();
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    record.verified = true;
    record.resetTokenHash = hashValue(resetToken);
    record.resetTokenExpiresAt = new Date(Date.now() + REGISTRATION_TOKEN_LIFETIME_MS);
    record.expiresAt = record.resetTokenExpiresAt;
    await record.save();
    res.json({ success: true, message: 'Email verified.', resetToken });
  } catch (error) {
    console.error('Verify password reset error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify the code.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { resetToken, password, confirmPassword } = req.body;
    if (!validEmail(email) || !resetToken || !password || !confirmPassword) return res.status(400).json({ success: false, message: 'Complete all required fields.' });
    if (!strongPassword(password)) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters and include uppercase, lowercase and a number.' });
    if (password !== confirmPassword) return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    const record = await PasswordResetOtp.findOne({ email, verified: true });
    if (!record || record.resetTokenExpiresAt <= new Date() || record.resetTokenHash !== hashValue(resetToken)) return res.status(401).json({ success: false, message: 'Password reset verification has expired. Start again.' });
    const user = await User.findOne({ email, isActive: true });
    if (!user) return res.status(404).json({ success: false, message: 'Unable to reset this account.' });
    user.password = await bcrypt.hash(password, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await AuthSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    await PasswordResetOtp.deleteOne({ email });
    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Unable to reset the password.' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!validEmail(normalizedEmail)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    const user = await User.findOne({ email: normalizedEmail }, '+loginAttempts +lockUntil +tokenVersion');
    if (user?.lockUntil && user.lockUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
      return res.status(429).json({ success: false, message: 'Too many failed attempts. Try again later.', retryAfter });
    }
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
      if (user?.isActive) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) user.lockUntil = new Date(Date.now() + LOGIN_LOCK_MS);
        await user.save();
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (user.loginAttempts || user.lockUntil) {
      user.loginAttempts = 0; user.lockUntil = null; await user.save();
    }
    if (user.mfaEnabled) {
      const otp = String(crypto.randomInt(100000, 1000000));
      const challenge = await MfaChallenge.create({ user: user._id, purpose: 'login', otpHash: hashValue(otp), expiresAt: new Date(Date.now() + OTP_LIFETIME_MS) });
      try { await sendSecurityOtp(user.email, otp, 'mfa'); }
      catch (mailError) { await MfaChallenge.deleteOne({ _id: challenge._id }); return res.status(503).json({ success: false, message: 'Unable to send the MFA code.' }); }
      return res.status(202).json({ success: true, mfaRequired: true, challengeId: challenge._id, expiresAt: challenge.expiresAt, message: 'Enter the security code sent to your email.' });
    }
    res.json({ success: true, message: 'Login successful.', token: await signToken(user, req), user: publicUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Unable to log in.' });
  }
};

const me = async (req, res) => res.json({ success: true, user: publicUser(req.user) });

const verifyMfa = async (req, res) => {
  try {
    const otp = String(req.body.otp || '').trim();
    const challenge = await MfaChallenge.findById(req.body.challengeId);
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) return res.status(410).json({ success: false, message: 'Security code expired. Start again.' });
    if (challenge.attempts >= 5) return res.status(429).json({ success: false, message: 'Too many incorrect attempts.' });
    if (!/^\d{6}$/.test(otp) || challenge.otpHash !== hashValue(otp)) { challenge.attempts += 1; await challenge.save(); return res.status(400).json({ success: false, message: 'Incorrect security code.' }); }
    const user = await User.findById(challenge.user).select('+tokenVersion');
    if (!user?.isActive) return res.status(401).json({ success: false, message: 'Account is unavailable.' });
    challenge.usedAt = new Date(); await challenge.save();
    if (challenge.purpose === 'enable') { user.mfaEnabled = true; await user.save(); return res.json({ success: true, message: 'Multi-factor authentication enabled.', user: publicUser(user) }); }
    res.json({ success: true, message: 'Login successful.', token: await signToken(user, req), user: publicUser(user) });
  } catch (error) { res.status(400).json({ success: false, message: 'Unable to verify the security code.' }); }
};

const requestMfaEnable = async (req, res) => {
  const otp = String(crypto.randomInt(100000, 1000000));
  const challenge = await MfaChallenge.create({ user: req.user._id, purpose: 'enable', otpHash: hashValue(otp), expiresAt: new Date(Date.now() + OTP_LIFETIME_MS) });
  try { await sendSecurityOtp(req.user.email, otp, 'mfa'); }
  catch (error) { await MfaChallenge.deleteOne({ _id: challenge._id }); return res.status(503).json({ success: false, message: 'Unable to send the MFA code.' }); }
  res.json({ success: true, challengeId: challenge._id, expiresAt: challenge.expiresAt, message: 'A security code was sent to your email.' });
};

const disableMfa = async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!req.body.password || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ success: false, message: 'Password is incorrect.' });
  user.mfaEnabled = false; await user.save();
  res.json({ success: true, message: 'Multi-factor authentication disabled.', user: publicUser(user) });
};

const sessions = async (req, res) => {
  const items = await AuthSession.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 });
  res.json({ success: true, sessions: items.map(item => ({ id: item._id, device: item.device, ip: item.ip, lastUsedAt: item.lastUsedAt, createdAt: item.createdAt, current: String(item._id) === String(req.authSession?._id) })) });
};
const logout = async (req, res) => { await AuthSession.findByIdAndUpdate(req.authSession._id, { revokedAt: new Date() }); res.json({ success: true, message: 'Logged out.' }); };
const revokeSession = async (req, res) => { const item = await AuthSession.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { revokedAt: new Date() }); if (!item) return res.status(404).json({ success: false, message: 'Session not found.' }); res.json({ success: true, message: 'Session revoked.' }); };
const logoutAll = async (req, res) => { await AuthSession.updateMany({ user: req.user._id, revokedAt: null }, { revokedAt: new Date() }); res.json({ success: true, message: 'Logged out from all devices.' }); };

module.exports = { requestRegistrationOtp, verifyRegistrationOtp, completeRegistration, requestPasswordResetOtp, verifyPasswordResetOtp, resetPassword, login, me, publicUser, verifyMfa, requestMfaEnable, disableMfa, sessions, logout, revokeSession, logoutAll };
