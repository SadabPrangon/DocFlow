const nodemailer = require('nodemailer');

const createTransport = () => {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
  }
  if (process.env.NODE_ENV !== 'production') return nodemailer.createTransport({ jsonTransport: true });
  throw new Error('Email transport is not configured.');
};

const sendRegistrationOtp = async (email, otp) => {
  const transporter = createTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || 'DocFlow <no-reply@docflow.local>';
  const info = await transporter.sendMail({
    from,
    to: email,
    subject: 'DocFlow email verification',
    text: `DocFlow verification code\n\nYour code is: ${otp}\n\nThis code expires in 2 minutes. Do not share it with anyone.\n\nIf you did not request this code, ignore this email.`,
  });
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST && !process.env.EMAIL_USER) {
    console.log(`Development verification email generated for ${email}.`);
  }
  return { accepted: info.accepted || [], rejected: info.rejected || [], messageId: info.messageId };
};

const sendPasswordResetOtp = async (email, otp) => {
  const transporter = createTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || 'DocFlow <no-reply@docflow.local>';
  const info = await transporter.sendMail({
    from,
    to: email,
    subject: 'DocFlow password reset',
    text: `DocFlow password reset\n\nYour verification code is: ${otp}\n\nThis code expires in 2 minutes. Do not share it with anyone.\n\nIf you did not request a password reset, ignore this email.`,
  });
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST && !process.env.EMAIL_USER) console.log(`Development password reset email generated for ${email}.`);
  return { accepted: info.accepted || [], rejected: info.rejected || [], messageId: info.messageId };
};

const sendSecurityOtp = async (email, otp, purpose) => {
  const transporter = createTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || 'DocFlow <no-reply@docflow.local>';
  const label = purpose === 'email-change' ? 'email address change' : 'multi-factor authentication';
  const info = await transporter.sendMail({ from, to: email, subject: `DocFlow ${label} code`, text: `DocFlow security code\n\nYour code is: ${otp}\n\nThis code expires in 2 minutes. Do not share it with anyone.` });
  return { accepted: info.accepted || [], rejected: info.rejected || [], messageId: info.messageId };
};

const sendAppointmentReminder = async (email, appointment) => {
  const transporter = createTransport();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || 'DocFlow <no-reply@docflow.local>';
  const info = await transporter.sendMail({ from, to: email, subject: 'DocFlow appointment reminder', text: `Reminder: your appointment with ${appointment.doctorName} is on ${appointment.appointmentDate} at ${appointment.appointmentTime}.\n\nLocation: ${appointment.location}` });
  return { accepted: info.accepted || [], rejected: info.rejected || [], messageId: info.messageId };
};

module.exports = { sendRegistrationOtp, sendPasswordResetOtp, sendSecurityOtp, sendAppointmentReminder };
