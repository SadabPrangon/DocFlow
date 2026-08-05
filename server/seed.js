require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const production = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.ADMIN_EMAIL || (production ? '' : 'admin@docflow.com');
  const adminPassword = process.env.ADMIN_PASSWORD || (production ? '' : 'Admin123');
  if (!adminEmail || !adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required when seeding production.');
  if (production && (adminPassword.length < 12 || !/[A-Z]/.test(adminPassword) || !/[a-z]/.test(adminPassword) || !/\d/.test(adminPassword) || !/[^A-Za-z0-9]/.test(adminPassword))) throw new Error('Production ADMIN_PASSWORD must be at least 12 characters and contain upper, lower, number, and symbol characters.');
  if (!(await User.findOne({ role: 'admin' }))) {
    await User.create({ name: 'DocFlow Admin', email: adminEmail, password: await bcrypt.hash(adminPassword, 10), role: 'admin', phone: '01700000000' });
    console.log(`Admin created: ${adminEmail}. The password was not printed.`);
  } else console.log('Admin already exists.');

  const doctors = !production || process.env.SEED_SAMPLE_USERS === 'true' ? [
    { name: 'Dr. Sarah Ahmed', email: 'sarah@docflow.com', specialty: 'Cardiology', experience: '12 years', location: 'Dhaka Medical Centre', fee: 800 },
    { name: 'Dr. Fahim Rahman', email: 'fahim@docflow.com', specialty: 'Neurology', experience: '9 years', location: 'DocFlow Clinic', fee: 700 },
    { name: 'Dr. Nusrat Jahan', email: 'nusrat@docflow.com', specialty: 'General Medicine', experience: '10 years', location: 'Care Point Hospital', fee: 600 },
  ] : [];
  const doctorPassword = process.env.SAMPLE_DOCTOR_PASSWORD || 'Doctor123';
  if (production && doctors.length && (doctorPassword.length < 12 || !/[^A-Za-z0-9]/.test(doctorPassword))) throw new Error('SAMPLE_DOCTOR_PASSWORD must be production-strength when SEED_SAMPLE_USERS=true.');
  for (const d of doctors) {
    if (!(await User.findOne({ email: d.email }))) {
      await User.create({ ...d, password: await bcrypt.hash(doctorPassword, 10), role: 'doctor', phone: '01711111111' });
    }
  }
  if (doctors.length) console.log('Sample doctors ready. Development-only credentials are documented in README.md.');
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
