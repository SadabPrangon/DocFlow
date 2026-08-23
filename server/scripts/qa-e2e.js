require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const qaMailConfig = { user:process.env.EMAIL_USER, pass:process.env.EMAIL_PASS, from:process.env.EMAIL_FROM };

process.env.NODE_ENV = 'test';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;
delete process.env.SMTP_HOST;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
process.env.AI_ASSISTANT="false";
delete process.env.SSLCOMMERZ_STORE_ID;
delete process.env.SSLCOMMERZ_STORE_PASSWORD;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

const QA_DB = `docflow_qa_${Date.now()}`;
const results = [];
const skipped = [];
const check = (condition, name, detail = '') => {
  results.push({ ok: Boolean(condition), name, detail: condition ? '' : detail });
  if (!condition) console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, detail) => { skipped.push({ name, detail }); console.log(`SKIP: ${name} — ${detail}`); };
const hash = value => crypto.createHmac('sha256', process.env.OTP_SECRET || process.env.JWT_SECRET).update(String(value)).digest('hex');

let server;
let base;
let User;
let Appointment;
let RegistrationOtp;
let PasswordResetOtp;

const call = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  return { status: response.status, data };
};

const rawCall = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
  });
  return { status: response.status, text: await response.text(), headers: response.headers };
};

const login = async (email, password) => call('/api/auth/login', { method: 'POST', body: { email, password } });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: QA_DB });
    const app = require('../src/app');
    const operations = require('../lib/operations');
    operations.setReady(true);
    User = require('../models/User');
    Appointment = require('../models/Appointment');
    RegistrationOtp = require('../models/RegistrationOtp');
    PasswordResetOtp = require('../models/PasswordResetOtp');
    await Promise.all([User.init(), Appointment.init(), RegistrationOtp.init(), PasswordResetOtp.init(), require('../models/QueueState').init(), require('../models/Notification').init(), require('../models/AuditLog').init(), require('../models/AuthSession').init(), require('../models/EmailChangeOtp').init(), require('../models/MfaChallenge').init(), require('../models/MedicalRecord').init(), require('../models/Prescription').init(), require('../models/Message').init(), require('../models/Payment').init(), require('../models/PaymentEvent').init()]);
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    const passwordHash = await bcrypt.hash('Password123', 10);
    const [admin, patient1, patient2, doctor1, doctor2, receptionist, inactiveDoctor] = await User.create([
      { name: 'QA Admin', email: 'admin@qa.test', password: passwordHash, role: 'admin' },
      { name: 'QA Patient One', email: 'patient1@qa.test', password: passwordHash, role: 'patient', age: 30 },
      { name: 'QA Patient Two', email: 'patient2@qa.test', password: passwordHash, role: 'patient', age: 25 },
      { name: 'QA Doctor One', email: 'doctor1@qa.test', password: passwordHash, role: 'doctor', specialty: 'Cardiology', experience: '8 years', location: 'QA Clinic', fee: 500 },
      { name: 'QA Doctor Two', email: 'doctor2@qa.test', password: passwordHash, role: 'doctor', specialty: 'Neurology', location: 'QA Clinic', fee: 600 },
      { name: 'QA Reception', email: 'reception@qa.test', password: passwordHash, role: 'receptionist' },
      { name: 'QA Inactive', email: 'inactive@qa.test', password: passwordHash, role: 'doctor', isActive: false },
    ]);

    let response = await call('/');
    check(response.status === 200 && response.data.success, 'API health endpoint');
    response = await call('/api/appointments/mine');
    check(response.status === 401, 'Protected route rejects anonymous user', JSON.stringify(response.data));

    const sessions = {};
    for (const [role, email] of [['admin','admin@qa.test'],['patient1','patient1@qa.test'],['patient2','patient2@qa.test'],['doctor1','doctor1@qa.test'],['doctor2','doctor2@qa.test'],['receptionist','reception@qa.test']]) {
      response = await login(email, 'Password123');
      check(response.status === 200 && response.data.token, `Login succeeds for ${role}`, JSON.stringify(response.data));
      sessions[role] = response.data.token;
    }
    response = await login('patient1@qa.test', 'wrong');
    check(response.status === 401, 'Invalid password is rejected');
    response = await login('inactive@qa.test', 'Password123');
    check(response.status === 401, 'Inactive account cannot log in');
    response = await call('/api/users/admin/stats', { token: sessions.patient1 });
    check(response.status === 403, 'Patient cannot access admin statistics');

    response = await call('/api/auth/register/request-otp', { method:'POST', body:{ email:'invalid' } });
    check(response.status === 400, 'Registration rejects invalid email');
    response = await call('/api/auth/register/request-otp', { method:'POST', body:{ email:'patient1@qa.test' } });
    check(response.status === 409, 'Registration rejects existing email');
    response = await call('/api/auth/register/request-otp', { method:'POST', body:{ email:'newpatient@qa.test' } });
    check(response.status === 200 && response.data.expiresAt, 'Registration OTP request succeeds');
    const registration = await RegistrationOtp.findOne({ email:'newpatient@qa.test' });
    check(Boolean(registration) && registration.expiresAt > new Date(), 'Registration OTP stored with future expiry');
    response = await call('/api/auth/register/verify-otp', { method:'POST', body:{ email:'newpatient@qa.test', otp:'111111' } });
    check(response.status === 400, 'Incorrect registration OTP is rejected');
    registration.otpHash = hash('123456'); registration.attempts = 0; registration.expiresAt = new Date(Date.now()+120000); await registration.save();
    response = await call('/api/auth/register/verify-otp', { method:'POST', body:{ email:'newpatient@qa.test', otp:'123456' } });
    check(response.status === 200 && response.data.registrationToken, 'Correct registration OTP is accepted');
    const registrationToken = response.data.registrationToken;
    response = await call('/api/auth/register/complete', { method:'POST', body:{ email:'newpatient@qa.test', registrationToken, fullName:'New QA Patient', dateOfBirth:'1995-04-10', address:'QA Address', password:'Password456', confirmPassword:'different' } });
    check(response.status === 400, 'Registration rejects password mismatch');
    response = await call('/api/auth/register/complete', { method:'POST', body:{ email:'newpatient@qa.test', registrationToken, fullName:'New QA Patient', dateOfBirth:'1995-04-10', address:'QA Address', password:'Password456', confirmPassword:'Password456', privacyConsent:true } });
    check(response.status === 201 && response.data.user.age > 0, 'Verified registration completes and calculates age', JSON.stringify(response.data));
    response = await call('/api/auth/register/complete', { method:'POST', body:{ email:'newpatient@qa.test', registrationToken, fullName:'Again', dateOfBirth:'1995-04-10', password:'Password456', confirmPassword:'Password456' } });
    check(response.status !== 201, 'Registration token cannot be reused');

    response = await call('/api/auth/password/forgot', { method:'POST', body:{ email:'missing@qa.test' } });
    check(response.status === 200 && /If an active account/.test(response.data.message), 'Forgot password hides account existence');
    response = await call('/api/auth/password/forgot', { method:'POST', body:{ email:'patient1@qa.test' } });
    check(response.status === 200, 'Password-reset OTP request succeeds');
    const reset = await PasswordResetOtp.findOne({ email:'patient1@qa.test' });
    check(Boolean(reset), 'Password-reset OTP record is stored');
    reset.otpHash = hash('654321'); reset.expiresAt = new Date(Date.now()+120000); await reset.save();
    response = await call('/api/auth/password/verify-otp', { method:'POST', body:{ email:'patient1@qa.test', otp:'000000' } });
    check(response.status === 400, 'Incorrect password-reset OTP is rejected');
    response = await call('/api/auth/password/verify-otp', { method:'POST', body:{ email:'patient1@qa.test', otp:'654321' } });
    check(response.status === 200 && response.data.resetToken, 'Correct password-reset OTP is accepted');
    const resetToken = response.data.resetToken;
    response = await call('/api/auth/password/reset', { method:'POST', body:{ email:'patient1@qa.test', resetToken, password:'NewPassword123', confirmPassword:'wrong' } });
    check(response.status === 400, 'Password reset rejects mismatch');
    response = await call('/api/auth/password/reset', { method:'POST', body:{ email:'patient1@qa.test', resetToken, password:'NewPassword123', confirmPassword:'NewPassword123' } });
    check(response.status === 200, 'Password reset succeeds');
    response = await login('patient1@qa.test', 'Password123');
    check(response.status === 401, 'Old password stops working');
    response = await login('patient1@qa.test', 'NewPassword123');
    check(response.status === 200, 'New password works');
    sessions.patient1 = response.data.token;

    response = await call('/api/users/admin/stats', { token:sessions.admin });
    check(response.status === 200 && response.data.stats.patients >= 3, 'Admin statistics load');
    response = await call('/api/users/admin/users', { token:sessions.admin });
    check(response.status === 200 && response.data.users.length >= 8, 'Admin user list loads');
    response = await call('/api/users/admin/staff', { method:'POST', token:sessions.admin, body:{ name:'Created Doctor', email:'created.doctor@qa.test', password:'Doctor123', role:'doctor', specialty:'General Medicine', location:'New Clinic', fee:450 } });
    check(response.status === 201, 'Admin creates doctor');
    const createdDoctorId = response.data.user.id;
    response = await call('/api/users/admin/staff', { method:'POST', token:sessions.admin, body:{ name:'Duplicate', email:'created.doctor@qa.test', password:'Doctor123', role:'doctor' } });
    check(response.status === 409, 'Duplicate staff email is rejected');
    response = await call('/api/users/admin/staff', { method:'POST', token:sessions.admin, body:{ name:'Created Reception', email:'created.reception@qa.test', password:'Reception123', role:'receptionist' } });
    check(response.status === 201, 'Admin creates receptionist');
    response = await call(`/api/users/admin/staff/${createdDoctorId}/toggle`, { method:'PATCH', token:sessions.admin });
    check(response.status === 200 && response.data.user.isActive === false, 'Admin deactivates staff');
    response = await call('/api/users/doctors', { token:sessions.patient1 });
    check(response.status === 200 && !response.data.doctors.some(item=>item.id===createdDoctorId), 'Inactive doctor is hidden from doctor directory');
    await call(`/api/users/admin/staff/${createdDoctorId}/toggle`, { method:'PATCH', token:sessions.admin });

    response = await call('/api/users/me', { method:'PUT', token:sessions.patient1, body:{ name:'Updated Patient', email:'patient1@qa.test', phone:'01700000000', age:31, gender:'Other', address:'Updated address' } });
    check(response.status === 200 && response.data.user.name === 'Updated Patient', 'Patient profile updates');
    response = await call('/api/users/me', { method:'PUT', token:sessions.patient1, body:{ name:'Updated Patient', email:'patient2@qa.test' } });
    check(response.status === 409, 'Patient profile rejects duplicate email');

    const appointmentBody = { doctorId:String(doctor1._id), appointmentDate:'2026-09-20', appointmentTime:'9:00 AM', reason:'QA consultation', paymentMethod:'cash' };
    response = await call('/api/appointments', { method:'POST', token:sessions.patient1, body:appointmentBody });
    check(response.status === 201 && response.data.appointment.status === 'Pending', 'Patient books appointment');
    const firstId = response.data.appointment._id;
    response = await call('/api/appointments', { method:'POST', token:sessions.patient1, body:appointmentBody });
    check(response.status === 409, 'Duplicate active appointment is rejected');
    response = await call('/api/appointments', { method:'POST', token:sessions.patient2, body:{...appointmentBody,appointmentTime:'10:00 AM',reason:'Second patient'} });
    const secondId = response.data.appointment?._id; check(response.status === 201, 'Second patient books same doctor/date');
    const patient3 = await User.create({name:'QA Patient Three',email:'patient3@qa.test',password:passwordHash,role:'patient'});
    response = await login('patient3@qa.test','Password123'); sessions.patient3=response.data.token;
    response = await call('/api/appointments', { method:'POST', token:sessions.patient3, body:{...appointmentBody,appointmentTime:'11:00 AM',reason:'Third patient',paymentMethod:'online'} });
    const thirdId=response.data.appointment?._id; check(response.status===201&&response.data.appointment.paymentMethod==='online','Online payment option is recorded as demo');
    response = await call('/api/appointments/all', { token:sessions.receptionist });
    check(response.status===200&&response.data.appointments.length===3,'Receptionist sees all appointments');
    response = await call(`/api/appointments/${firstId}/approve`, { method:'PUT', token:sessions.receptionist });
    check(response.status===200&&response.data.appointment.queueNumber===1&&response.data.appointment.queueStatus==='Current','First approval starts queue at #1');
    response = await call(`/api/appointments/${secondId}/approve`, { method:'PUT', token:sessions.receptionist });
    check(response.status===200&&response.data.appointment.queueNumber===2&&response.data.appointment.queueStatus==='Waiting','Second approval assigns waiting queue #2');
    response = await call(`/api/appointments/${thirdId}/approve`, { method:'PUT', token:sessions.receptionist });
    check(response.status===200&&response.data.appointment.queueNumber===3,'Third approval assigns queue #3');
    response = await call(`/api/appointments/${firstId}/approve`, { method:'PUT', token:sessions.receptionist });
    check(response.status===400,'Non-pending appointment cannot be approved again');
    response = await call(`/api/appointments/${firstId}/cancel`, { method:'PUT', token:sessions.patient1 });
    check(response.status===400,'Current consultation cannot be cancelled');
    response = await call(`/api/appointments/${secondId}/cancel`, { method:'PUT', token:sessions.patient2 });
    check(response.status===200,'Waiting patient can cancel');
    response = await call(`/api/appointments/${thirdId}/advance`, { method:'PUT', token:sessions.receptionist, body:{action:'complete'} });
    check(response.status===400,'Non-current queue item cannot advance');
    response = await call(`/api/appointments/${firstId}`, { token:sessions.patient2 });
    check(response.status===403,'Unrelated patient cannot view another appointment');
    response = await call(`/api/appointments/${firstId}`, { token:sessions.patient1 });
    check(response.status===200&&response.data.appointment.currentServing===1,'Patient can view own live queue');
    response = await call('/api/appointments/doctor/mine', { token:sessions.doctor1 });
    check(response.status===200&&response.data.appointments.length===3,'Doctor sees assigned appointments');
    response = await call(`/api/appointments/${firstId}/doctor-update`, { method:'PUT', token:sessions.doctor2, body:{doctorNotes:'Unauthorized'} });
    check(response.status===404,'Other doctor cannot update consultation');
    response = await call(`/api/appointments/${firstId}/doctor-update`, { method:'PUT', token:sessions.doctor1, body:{doctorNotes:'QA notes',prescription:'QA prescription'} });
    check(response.status===200,'Assigned doctor saves notes and prescription');
    response = await call(`/api/appointments/${firstId}/advance`, { method:'PUT', token:sessions.doctor1, body:{action:'complete',doctorNotes:'Final notes',prescription:'Final prescription'} });
    check(response.status===200&&/Queue advanced to #3/.test(response.data.message),'Completing current consultation advances past cancelled patient');
    const first = await Appointment.findById(firstId); const third = await Appointment.findById(thirdId);
    check(first.status==='Completed'&&first.prescription==='Final prescription','Completion persists prescription and completed status');
    check(third.isCurrentServing&&third.queueStatus==='Current','Next eligible waiting patient becomes current');
    response = await call(`/api/appointments/${thirdId}/advance`, { method:'PUT', token:sessions.receptionist, body:{action:'skip'} });
    check(response.status===200&&/Queue completed/.test(response.data.message),'Skipping last queue item completes queue');
    const skippedAppointment = await Appointment.findById(thirdId);
    check(skippedAppointment.queueStatus==='Skipped'&&!skippedAppointment.isCurrentServing,'Skipped patient state is stored');
    response = await call('/api/appointments/mine', { token:sessions.patient1 });
    check(response.status===200&&response.data.appointments.some(item=>item.prescription==='Final prescription'),'Patient sees completed prescription');

    // Extended authentication and token boundaries.
    response = await call('/api/auth/me', { token:sessions.patient1 });
    check(response.status===200&&response.data.user.email==='patient1@qa.test','Authenticated user can load /auth/me');
    response = await call('/api/auth/me', { token:'not-a-valid-jwt' });
    check(response.status===401,'Corrupt JWT is rejected');
    const expiredJwt = jwt.sign({id:patient1._id,role:'patient'},process.env.JWT_SECRET,{expiresIn:-1});
    response = await call('/api/auth/me', { token:expiredJwt });
    check(response.status===401,'Expired JWT is rejected');
    response = await call('/api/auth/login', { method:'POST', body:{email:{$ne:null},password:{$ne:null}} });
    check(response.status===400,'NoSQL-style login payload is rejected as a bad request',`status ${response.status}`);

    // Registration boundary, expiry, lockout, cooldown, and mail-failure cases.
    await RegistrationOtp.create({email:'expired-registration@qa.test',otpHash:hash('112233'),expiresAt:new Date(Date.now()-1000)});
    response = await call('/api/auth/register/verify-otp',{method:'POST',body:{email:'expired-registration@qa.test',otp:'112233'}});
    check(response.status===410,'Expired registration OTP is rejected');
    await RegistrationOtp.create({email:'locked-registration@qa.test',otpHash:hash('112233'),expiresAt:new Date(Date.now()+120000),attempts:5});
    response = await call('/api/auth/register/verify-otp',{method:'POST',body:{email:'locked-registration@qa.test',otp:'112233'}});
    check(response.status===429,'Registration OTP locks after five incorrect attempts');
    await RegistrationOtp.create({email:'cooldown-registration@qa.test',otpHash:hash('112233'),expiresAt:new Date(Date.now()+120000)});
    response = await call('/api/auth/register/request-otp',{method:'POST',body:{email:'cooldown-registration@qa.test'}});
    check(response.status===429&&response.data.retryAfter>0,'Registration OTP resend cooldown is enforced');

    const boundaryEmail='boundary-registration@qa.test'; const boundaryToken='boundary-token';
    await RegistrationOtp.create({email:boundaryEmail,otpHash:hash('112233'),expiresAt:new Date(Date.now()+600000),verified:true,registrationTokenHash:hash(boundaryToken),registrationTokenExpiresAt:new Date(Date.now()+600000)});
    response = await call('/api/auth/register/complete',{method:'POST',body:{email:boundaryEmail,registrationToken:boundaryToken}});
    check(response.status===400,'Registration rejects missing required fields');
    response = await call('/api/auth/register/complete',{method:'POST',body:{email:boundaryEmail,registrationToken:boundaryToken,fullName:'Boundary User',dateOfBirth:'2099-01-01',password:'Password123',confirmPassword:'Password123'}});
    check(response.status===400,'Registration rejects future date of birth');
    response = await call('/api/auth/register/complete',{method:'POST',body:{email:boundaryEmail,registrationToken:boundaryToken,fullName:'Boundary User',dateOfBirth:'1990-01-01',password:'short',confirmPassword:'short'}});
    check(response.status===400,'Registration rejects short password');
    const expiredRegistrationToken='expired-registration-token';
    await RegistrationOtp.create({email:'expired-token-registration@qa.test',otpHash:hash('112233'),expiresAt:new Date(Date.now()+600000),verified:true,registrationTokenHash:hash(expiredRegistrationToken),registrationTokenExpiresAt:new Date(Date.now()-1000)});
    response = await call('/api/auth/register/complete',{method:'POST',body:{email:'expired-token-registration@qa.test',registrationToken:expiredRegistrationToken,fullName:'Expired User',dateOfBirth:'1990-01-01',password:'Password123',confirmPassword:'Password123'}});
    check(response.status===401,'Expired registration token is rejected');
    const priorNodeEnv=process.env.NODE_ENV; process.env.NODE_ENV='production';
    response = await call('/api/auth/register/request-otp',{method:'POST',body:{email:'mail-failure@qa.test'}});
    process.env.NODE_ENV=priorNodeEnv;
    check(response.status===503,'Registration API reports email transport failure');

    // Password-reset expiry, lockout, cooldown, and token expiry.
    await PasswordResetOtp.create({email:'expired-reset@qa.test',otpHash:hash('445566'),expiresAt:new Date(Date.now()-1000)});
    response = await call('/api/auth/password/verify-otp',{method:'POST',body:{email:'expired-reset@qa.test',otp:'445566'}});
    check(response.status===410,'Expired password-reset OTP is rejected');
    await PasswordResetOtp.create({email:'locked-reset@qa.test',otpHash:hash('445566'),expiresAt:new Date(Date.now()+120000),attempts:5});
    response = await call('/api/auth/password/verify-otp',{method:'POST',body:{email:'locked-reset@qa.test',otp:'445566'}});
    check(response.status===429,'Password-reset OTP locks after five attempts');
    await PasswordResetOtp.create({email:'patient2@qa.test',otpHash:hash('445566'),expiresAt:new Date(Date.now()+120000)});
    response = await call('/api/auth/password/forgot',{method:'POST',body:{email:'patient2@qa.test'}});
    check(response.status===429&&response.data.retryAfter>0,'Password-reset resend cooldown is enforced');
    const expiredResetToken='expired-reset-token';
    await PasswordResetOtp.findOneAndUpdate({email:'patient2@qa.test'},{email:'patient2@qa.test',otpHash:hash('445566'),expiresAt:new Date(Date.now()+600000),verified:true,resetTokenHash:hash(expiredResetToken),resetTokenExpiresAt:new Date(Date.now()-1000)},{upsert:true});
    response = await call('/api/auth/password/reset',{method:'POST',body:{email:'patient2@qa.test',resetToken:expiredResetToken,password:'Password789',confirmPassword:'Password789'}});
    check(response.status===401,'Expired password-reset token is rejected');

    // Staff update and listing boundaries.
    response = await call('/api/users/admin/staff',{method:'POST',token:sessions.admin,body:{name:'Invalid Role',email:'invalid-role@qa.test',password:'Password123',role:'patient'}});
    check(response.status===400,'Admin staff creation rejects invalid role');
    response = await call('/api/users/admin/staff',{method:'POST',token:sessions.admin,body:{role:'doctor'}});
    check(response.status===400,'Admin staff creation rejects missing fields');
    response = await call(`/api/users/admin/staff/${createdDoctorId}`,{method:'PUT',token:sessions.admin,body:{name:'Updated Created Doctor',fee:725,location:'Updated Clinic'}});
    check(response.status===200&&response.data.user.name==='Updated Created Doctor'&&response.data.user.fee===725,'Admin updates staff profile');
    const missingId=new mongoose.Types.ObjectId();
    response = await call(`/api/users/admin/staff/${missingId}`,{method:'PUT',token:sessions.admin,body:{name:'Missing'}});
    check(response.status===404,'Updating nonexistent staff returns not found');
    response = await call(`/api/users/admin/staff/${missingId}/toggle`,{method:'PATCH',token:sessions.admin});
    check(response.status===404,'Toggling nonexistent staff returns not found');
    response = await call('/api/users/admin/users?role=doctor',{token:sessions.admin});
    check(response.status===200&&response.data.users.every(user=>user.role==='doctor'),'Admin user listing filters by role');

    // Profile validation boundaries.
    response = await call('/api/users/me',{method:'PUT',token:sessions.patient1,body:{name:'',email:'patient1@qa.test'}});
    check(response.status===400,'Profile update requires name');
    response = await call('/api/users/me',{method:'PUT',token:sessions.patient1,body:{name:'Updated Patient',email:'patient1@qa.test',age:999}});
    check(response.status===400,'Profile update returns validation error for invalid age',`status ${response.status}`);
    response = await call('/api/users/me',{method:'PUT',token:sessions.patient3,body:{name:'QA Patient Three',email:'not-an-email'}});
    check(response.status===400,'Profile update rejects malformed email',`status ${response.status}`);

    // Appointment malformed, missing, nonexistent, access, and terminal-state cases.
    response = await call('/api/appointments',{method:'POST',token:sessions.patient1,body:{doctorId:String(doctor1._id)}});
    check(response.status===400,'Appointment booking rejects missing date, time, and reason');
    response = await call('/api/appointments',{method:'POST',token:sessions.patient1,body:{...appointmentBody,doctorId:String(missingId),appointmentDate:'2026-10-10'}});
    check(response.status===404,'Appointment booking rejects nonexistent doctor');
    response = await call('/api/appointments',{method:'POST',token:sessions.patient1,body:{...appointmentBody,doctorId:'invalid-id',appointmentDate:'2026-10-11'}});
    check(response.status===400,'Appointment booking rejects malformed doctor ID',`status ${response.status}`);
    response = await call(`/api/appointments/${missingId}`,{token:sessions.patient1});
    check(response.status===404,'Loading nonexistent appointment returns not found');
    response = await call('/api/appointments/not-an-id',{token:sessions.patient1});
    check(response.status===400,'Loading malformed appointment ID returns bad request',`status ${response.status}`);
    response = await call(`/api/appointments/${firstId}`,{token:sessions.admin});
    check(response.status===200,'Admin can inspect an appointment');
    response = await call(`/api/appointments/${firstId}`,{token:sessions.receptionist});
    check(response.status===200,'Receptionist can inspect an appointment');
    response = await call(`/api/appointments/${firstId}`,{token:sessions.doctor1});
    check(response.status===200,'Assigned doctor can inspect an appointment');
    response = await call(`/api/appointments/${firstId}/cancel`,{method:'PUT',token:sessions.patient1});
    check(response.status===400,'Completed appointment cannot be cancelled');
    response = await call(`/api/appointments/${secondId}/cancel`,{method:'PUT',token:sessions.patient2});
    check(response.status===400,'Already-cancelled appointment cannot be cancelled again');
    response = await call(`/api/appointments/${missingId}/approve`,{method:'PUT',token:sessions.receptionist});
    check(response.status===404,'Approving nonexistent appointment returns not found');

    // Concurrent booking and queue allocation race checks.
    const patient4=await User.create({name:'QA Patient Four',email:'patient4@qa.test',password:passwordHash,role:'patient'});
    response=await login('patient4@qa.test','Password123'); sessions.patient4=response.data.token;
    const concurrentBody={doctorId:String(doctor2._id),appointmentDate:'2026-11-01',appointmentTime:'9:00 AM',reason:'Concurrent booking'};
    const concurrentBookings=await Promise.all([call('/api/appointments',{method:'POST',token:sessions.patient4,body:concurrentBody}),call('/api/appointments',{method:'POST',token:sessions.patient4,body:concurrentBody})]);
    const bookingStatuses=concurrentBookings.map(item=>item.status).sort();
    check(bookingStatuses[0]===201&&bookingStatuses[1]===409,'Concurrent duplicate booking creates only one appointment',JSON.stringify(bookingStatuses));

    const raceDate='2026-11-02';
    const raceOne=await call('/api/appointments',{method:'POST',token:sessions.patient1,body:{doctorId:String(doctor2._id),appointmentDate:raceDate,appointmentTime:'9:00 AM',reason:'Queue race one'}});
    const raceTwo=await call('/api/appointments',{method:'POST',token:sessions.patient2,body:{doctorId:String(doctor2._id),appointmentDate:raceDate,appointmentTime:'10:00 AM',reason:'Queue race two'}});
    const raceApprovals=await Promise.all([call(`/api/appointments/${raceOne.data.appointment?._id}/approve`,{method:'PUT',token:sessions.receptionist}),call(`/api/appointments/${raceTwo.data.appointment?._id}/approve`,{method:'PUT',token:sessions.receptionist})]);
    const raceItems=await Appointment.find({doctor:doctor2._id,appointmentDate:raceDate}).lean();
    const raceNumbers=raceItems.map(item=>item.queueNumber); const currentCount=raceItems.filter(item=>item.isCurrentServing).length;
    check(raceApprovals.every(item=>item.status===200)&&new Set(raceNumbers).size===raceNumbers.length&&currentCount===1,'Concurrent approvals assign unique queue numbers and one current patient',JSON.stringify({statuses:raceApprovals.map(item=>item.status),raceNumbers,currentCount}));

    // Availability, slot collision, rescheduling, notification, audit, and queue-recovery cases.
    const weekly=Array.from({length:7},(_,day)=>({day,enabled:true,start:'09:00',end:'12:00'}));
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:{timezone:'Asia/Dhaka',slotDuration:60,weekly,unavailableDates:['2027-01-16']}});
    check(response.status===200&&response.data.availability.weekly.length===7,'Doctor can configure weekly availability');
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:{timezone:'Asia/Dhaka',slotDuration:20,weekly,unavailableDates:['2027-01-16']}});
    const shortDay=await call(`/api/users/doctors/${doctor2._id}/availability?date=2027-03-04`);
    check(response.status===200&&response.data.availability.slotDuration===20&&shortDay.data.slots.length===9&&shortDay.data.slots[0]==='9:00 AM'&&shortDay.data.slots[1]==='9:20 AM','Consultation length sets the spacing of bookable slots',JSON.stringify(shortDay.data.slots));
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:{timezone:'Asia/Dhaka',slotDuration:10,weekly,unavailableDates:[]}});
    const tenMinuteDay=await call(`/api/users/doctors/${doctor2._id}/availability?date=2027-03-04`);
    check(response.status===200&&tenMinuteDay.data.slots.length===18&&tenMinuteDay.data.slots[1]==='9:10 AM','A short consultation length is allowed',JSON.stringify({status:response.status,slots:tenMinuteDay.data.slots?.length}));
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:{timezone:'Asia/Dhaka',slotDuration:0,weekly,unavailableDates:[]}});
    check(response.status===400,'A consultation length of zero is rejected',JSON.stringify(response.data));
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:{timezone:'Asia/Dhaka',slotDuration:60,weekly,unavailableDates:['2027-01-16']}});
    response=await call(`/api/users/doctors/${doctor2._id}/availability?date=2027-01-16`);
    check(response.status===200&&response.data.slots.length===0,'Blocked doctor date has no bookable slots');
    response=await call('/api/appointments',{method:'POST',token:sessions.patient4,body:{doctorId:String(doctor2._id),appointmentDate:'2020-01-01',appointmentTime:'9:00 AM',reason:'Past booking'}});
    check(response.status===400,'Appointment booking rejects past dates');
    const scheduleBody={doctorId:String(doctor2._id),appointmentDate:'2027-01-15',appointmentTime:'9:00 AM',reason:'Schedule test'};
    response=await call('/api/appointments',{method:'POST',token:sessions.patient4,body:scheduleBody});
    const scheduleId=response.data.appointment?._id;
    check(response.status===201,'Patient books a schedule-controlled slot');
    check(response.data.appointment?.serial===1&&response.data.appointment?.appointmentTime==='9:00 AM','First patient of the day is serial 1 at the doctor start time',JSON.stringify({serial:response.data.appointment?.serial,time:response.data.appointment?.appointmentTime}));
    response=await call('/api/appointments',{method:'POST',token:sessions.patient3,body:{...scheduleBody,reason:'Second in line'}});
    check(response.status===201&&response.data.appointment.serial===2&&response.data.appointment.appointmentTime==='10:00 AM','Second patient is serial 2, one consultation later',JSON.stringify({serial:response.data.appointment?.serial,time:response.data.appointment?.appointmentTime}));
    response=await call('/api/appointments',{method:'POST',token:sessions.patient2,body:{...scheduleBody,reason:'Third in line'}});
    const lastPlaceId=response.data.appointment?._id;
    check(response.status===201&&response.data.appointment.serial===3&&response.data.appointment.appointmentTime==='11:00 AM','Third patient fills the last place of the day',JSON.stringify({serial:response.data.appointment?.serial,time:response.data.appointment?.appointmentTime}));
    response=await call('/api/appointments',{method:'POST',token:sessions.patient1,body:{...scheduleBody,reason:'One too many'}});
    check(response.status===409&&/fully booked/i.test(response.data.message||''),'A day with no places left refuses the booking',JSON.stringify(response.data));
    response=await call('/api/appointments',{method:'POST',token:sessions.patient4,body:{doctorId:String(doctor1._id),appointmentDate:'2027-02-08'}});
    check(response.status===201&&response.data.appointment.reason==='','A booking without a reason is accepted',JSON.stringify(response.data.message||response.data));
    response=await call(`/api/appointments/${lastPlaceId}/cancel`,{method:'PUT',token:sessions.patient2,body:{reason:'Freeing a place'}});
    response=await call(`/api/users/doctors/${doctor2._id}/availability?date=2027-01-15`);
    check(response.data.next?.serial===3&&response.data.next?.time==='11:00 AM','A cancellation hands its place to the next patient',JSON.stringify(response.data.next));
    response=await call(`/api/appointments/${scheduleId}/reschedule`,{method:'PUT',token:sessions.patient4,body:{appointmentDate:'2027-01-15'}});
    check(response.status===200&&response.data.appointment.rescheduleCount===1,'Patient reschedules an active appointment');
    response=await call('/api/notifications',{token:sessions.patient4});
    check(response.status===200&&response.data.unread>=2,'Appointment activity creates user notifications');
    response=await call('/api/notifications/read-all',{method:'PATCH',token:sessions.patient4});
    check(response.status===200,'User can mark all notifications read');
    response=await call('/api/users/admin/audit',{token:sessions.admin});
    check(response.status===200&&response.data.logs.some(log=>log.action==='appointment.rescheduled'),'Admin audit trail records appointment changes');
    const raceCurrent=raceItems.find(item=>item.isCurrentServing);
    response=await call(`/api/appointments/${raceCurrent._id}/advance`,{method:'PUT',token:sessions.receptionist,body:{action:'skip'}});
    check(response.status===200,'Receptionist can skip the current queue patient');
    response=await call(`/api/appointments/${raceCurrent._id}/rejoin`,{method:'PUT',token:sessions.receptionist});
    check(response.status===200&&response.data.appointment.queueStatus==='Waiting','Skipped patient can rejoin at the end of an active queue');
    const staleToken=jwt.sign({id:patient1._id,role:'patient',version:0},process.env.JWT_SECRET,{expiresIn:'1h'});
    response=await call('/api/auth/me',{token:staleToken});
    check(response.status===401,'Password reset revokes older login sessions');
    response=await call('/api/users/admin/staff',{method:'POST',token:sessions.admin,body:{name:'Weak Password',email:'weak@qa.test',password:'alllowercase',role:'doctor'}});
    check(response.status===400,'Staff account rejects a weak password');

    // High-priority identity, operations, and governance requirements.
    const EmailChangeOtp=require('../models/EmailChangeOtp'); const MfaChallenge=require('../models/MfaChallenge');
    response=await login('patient2@qa.test','Password123'); const secondPatient2Token=response.data.token;
    response=await call('/api/auth/sessions',{token:sessions.patient2});
    check(response.status===200&&response.data.sessions.length>=2,'User can list active device sessions');
    const otherSession=response.data.sessions.find(item=>!item.current);
    response=await call(`/api/auth/sessions/${otherSession.id}`,{method:'DELETE',token:sessions.patient2});
    check(response.status===200,'User can revoke another device session');
    response=await call('/api/auth/me',{token:sessions.patient2});
    check(response.status===200,'Revoking another device keeps current session active');
    response=await call('/api/auth/me',{token:secondPatient2Token});
    check(response.status===401,'Revoked device session immediately loses access');

    response=await call('/api/users/me/email/request',{method:'POST',token:sessions.patient3,body:{newEmail:'patient3.changed@qa.test',password:'Password123'}});
    check(response.status===200,'Verified email-change request sends a code to the new address');
    const emailChange=await EmailChangeOtp.findOne({user:patient3._id}); emailChange.otpHash=hash('246810'); await emailChange.save();
    response=await call('/api/users/me/email/verify',{method:'POST',token:sessions.patient3,body:{otp:'246810'}});
    check(response.status===200,'Correct email-change code updates the account');
    response=await call('/api/auth/me',{token:sessions.patient3});
    check(response.status===401,'Email change revokes existing sessions');
    response=await login('patient3.changed@qa.test','Password123');
    check(response.status===200,'User logs in with the newly verified email'); sessions.patient3=response.data.token;

    response=await call('/api/auth/mfa/enable',{method:'POST',token:sessions.doctor1});
    check(response.status===200&&response.data.challengeId,'Staff can request MFA enrollment');
    let mfa=await MfaChallenge.findById(response.data.challengeId); mfa.otpHash=hash('112233'); await mfa.save();
    response=await call('/api/auth/mfa/verify',{method:'POST',body:{challengeId:String(mfa._id),otp:'112233'}});
    check(response.status===200&&response.data.user.mfaEnabled,'Staff enables MFA with the emailed code');
    response=await login('doctor1@qa.test','Password123');
    check(response.status===202&&response.data.mfaRequired,'MFA-enabled staff login requires a second factor');
    mfa=await MfaChallenge.findById(response.data.challengeId); mfa.otpHash=hash('445566'); await mfa.save();
    response=await call('/api/auth/mfa/verify',{method:'POST',body:{challengeId:String(mfa._id),otp:'445566'}});
    check(response.status===200&&response.data.token,'Correct MFA login code creates a session');

    const overrideSchedule={timezone:'Asia/Dhaka',slotDuration:60,weekly,unavailableDates:[],overrides:[{date:'2027-01-17',enabled:true,start:'09:00',end:'12:00',breaks:[{start:'10:00',end:'11:00'}]}]};
    response=await call('/api/users/me/availability',{method:'PUT',token:sessions.doctor2,body:overrideSchedule});
    check(response.status===200,'Doctor saves dated schedule exceptions and breaks');
    response=await call(`/api/users/doctors/${doctor2._id}/availability?date=2027-01-17`);
    check(response.status===200&&response.data.slots.includes('9:00 AM')&&!response.data.slots.includes('10:00 AM')&&response.data.slots.includes('11:00 AM'),'Schedule break removes overlapping booking slots');

    response=await call(`/api/appointments/queue/${doctor2._id}/2027-02-01`,{method:'PATCH',token:sessions.receptionist,body:{action:'close',reason:'Clinic closed'}});
    check(response.status===200&&response.data.queue.closed,'Receptionist can close a doctor queue with a reason');
    response=await call('/api/appointments',{method:'POST',token:sessions.patient2,body:{doctorId:String(doctor2._id),appointmentDate:'2027-02-01',appointmentTime:'9:00 AM',reason:'Closed queue test'}});
    check(response.status===409,'Closed queue rejects new bookings');
    response=await call(`/api/appointments/queue/${doctor2._id}/2027-02-01`,{method:'PATCH',token:sessions.receptionist,body:{action:'reopen'}});
    check(response.status===200&&!response.data.queue.closed,'Receptionist can recover and reopen a queue');

    const pastAppointment=await Appointment.create({patient:patient2._id,doctor:doctor2._id,doctorName:doctor2.name,specialty:'Neurology',location:'QA Clinic',fee:600,appointmentDate:'2020-01-01',appointmentTime:'9:00 AM',reason:'No-show QA',status:'Approved',queueNumber:99});
    response=await call(`/api/appointments/${pastAppointment._id}/no-show`,{method:'PUT',token:sessions.receptionist});
    check(response.status===200&&response.data.appointment.status==='No-show','Staff can mark a past approved appointment as no-show');
    const lateCancellation=await Appointment.create({patient:patient2._id,doctor:doctor1._id,doctorName:doctor1.name,specialty:'Cardiology',location:'QA Clinic',fee:500,appointmentDate:'2020-01-02',appointmentTime:'9:00 AM',reason:'Late cancellation QA'});
    response=await call(`/api/appointments/${lateCancellation._id}/cancel`,{method:'PUT',token:sessions.patient2});
    check(response.status===409,'Cancellation cutoff rejects late patient cancellation');

    const reminderTime=new Date(Date.now()+60*60*1000); const dhaka=new Date(reminderTime.getTime()+6*60*60*1000); const reminderDate=dhaka.toISOString().slice(0,10); let reminderHour=dhaka.getUTCHours(); const reminderSuffix=reminderHour>=12?'PM':'AM'; reminderHour=reminderHour%12||12; const reminderDisplay=`${reminderHour}:${String(dhaka.getUTCMinutes()).padStart(2,'0')} ${reminderSuffix}`;
    const reminderAppointment=await Appointment.create({patient:patient2._id,doctor:doctor1._id,doctorName:doctor1.name,specialty:'Cardiology',location:'QA Clinic',fee:500,appointmentDate:reminderDate,appointmentTime:reminderDisplay,reason:'Reminder QA',status:'Approved'});
    response=await call('/api/appointments/reminders/run',{method:'POST',token:sessions.admin});
    const reminded=await Appointment.findById(reminderAppointment._id);
    check(response.status===200&&response.data.sent>=1&&Boolean(reminded.reminderSentAt),'Reminder worker sends and records due appointment reminders');

    response=await call('/api/users/me/export',{token:sessions.patient2});
    check(response.status===200&&response.data.data.profile&&Array.isArray(response.data.data.appointments),'User can export personal profile and appointment data');
    response=await call('/api/users/admin/audit/export',{token:sessions.admin});
    check(response.status===200,'Admin can export the role-protected audit log');

    // Major clinical, messaging, payment, calendar, reporting, and reassignment features.
    const recordBody={diagnosis:'Controlled hypertension',symptoms:['Headache'],allergies:['Penicillin'],vitals:{bloodPressure:'135/85',heartRate:76,temperatureC:36.8,weightKg:70,heightCm:170},labResults:[{name:'HbA1c',result:'5.7',unit:'%',referenceRange:'4.0-5.6'}],clinicalNotes:'Continue monitoring.'};
    response=await call(`/api/clinical/appointments/${firstId}/record`,{method:'PUT',token:sessions.doctor1,body:recordBody});
    check(response.status===200&&response.data.record.diagnosis==='Controlled hypertension','Assigned doctor saves a structured medical record');
    const prescriptionBody={medicines:[{name:'Amlodipine',dosage:'5 mg',frequency:'Once daily',duration:'30 days',instructions:'After breakfast'},{name:'Paracetamol',dosage:'500 mg',frequency:'As needed',duration:'5 days',instructions:'Maximum three daily'}],advice:'Reduce dietary salt.',followUpDate:'2027-02-01'};
    response=await call(`/api/clinical/appointments/${firstId}/prescription`,{method:'PUT',token:sessions.doctor1,body:prescriptionBody});
    check(response.status===200&&response.data.prescription.medicines.length===2,'Assigned doctor saves a multi-medicine structured prescription');
    response=await call('/api/clinical/history/mine',{token:sessions.patient1});
    check(response.status===200&&response.data.records.length>=1&&response.data.prescriptions[0].medicines.length===2,'Patient can view medical history and prescriptions');
    response=await call(`/api/clinical/appointments/${firstId}/record`,{method:'PUT',token:sessions.doctor2,body:recordBody});
    check(response.status===404,'Unassigned doctor cannot modify another doctor clinical record');
    response=await call(`/api/clinical/appointments/${firstId}/messages`,{method:'POST',token:sessions.patient1,body:{body:'I have a question about the dosage.'}});
    check(response.status===201,'Patient sends an appointment-scoped secure message');
    response=await call(`/api/clinical/appointments/${firstId}/messages`,{method:'POST',token:sessions.doctor1,body:{body:'Please follow the prescription instructions.'}});
    check(response.status===201,'Assigned doctor replies in the secure conversation');
    response=await call(`/api/clinical/appointments/${firstId}/messages`,{token:sessions.patient1});
    check(response.status===200&&response.data.messages.length===2,'Conversation participants can read secure messages');
    response=await call(`/api/clinical/appointments/${firstId}/messages`,{token:sessions.patient2});
    check(response.status===404,'Unrelated patient cannot read secure messages');

    response=await call(`/api/appointments/${firstId}/calendar`,{token:sessions.patient1});
    check(response.status===200,'Patient can download an appointment calendar event');
    response=await call('/api/appointments/reports/summary',{token:sessions.admin});
    check(response.status===200&&Array.isArray(response.data.report.byStatus),'Admin loads appointment and revenue reports');
    response=await call('/api/appointments/reports/export',{token:sessions.admin});
    check(response.status===200,'Admin exports appointment reporting CSV');
    response=await call('/api/appointments/all?search=Updated%20Patient&limit=2&page=1',{token:sessions.receptionist});
    check(response.status===200&&response.data.pagination.limit===2&&response.data.appointments.every(item=>item.patient?.name==='Updated Patient'),'Appointment search and pagination return filtered results');
    response=await call('/api/users/admin/users?search=doctor1&limit=1',{token:sessions.admin});
    check(response.status===200&&response.data.pagination.limit===1&&response.data.users.length===1,'Admin user search and pagination work');

    response=await call(`/api/appointments/${scheduleId}/reassign`,{method:'PUT',token:sessions.receptionist,body:{doctorId:String(doctor1._id)}});
    check(response.status===200&&String(response.data.appointment.doctor)===String(doctor1._id)&&response.data.appointment.status==='Pending','Receptionist safely reassigns an appointment to an available doctor');
    response=await call(`/api/payments/appointments/${scheduleId}/checkout`,{method:'POST',token:sessions.patient4});
    check(response.status===503,'Online checkout fails safely when no gateway credentials are present');
    const gatewayPost=(path,fields)=>fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),redirect:'manual'});
    let gateway=await gatewayPost('/api/payments/sslcommerz/success',{tran_id:'DFforged',status:'VALID',amount:'650.00'});
    check(gateway.status===303&&String(gateway.headers.get('location')).includes('status=failed'),'SSLCommerz success callback without a valid val_id cannot mark an appointment paid',`status ${gateway.status}`);
    gateway=await gatewayPost('/api/payments/sslcommerz/ipn',{tran_id:'DFforged'});
    check(gateway.status===400,'SSLCommerz IPN rejects a callback with no val_id to validate',`status ${gateway.status}`);
    gateway=await gatewayPost('/api/payments/sslcommerz/cancel',{tran_id:'DFforged'});
    check(gateway.status===303&&String(gateway.headers.get('location')).includes('status=cancelled'),'SSLCommerz cancel callback returns the patient to the payments page');
    response=await call('/api/payments/mine',{token:sessions.patient4});
    check(response.status===200&&Array.isArray(response.data.payments),'Patient payment history endpoint loads');

    response=await call('/api/users/me/notifications',{method:'PUT',token:sessions.patient1,body:{emailReminders:true,smsReminders:true,reminderHoursBefore:24}});
    check(response.status===400,'SMS reminders require an E.164 phone number');
    response=await call('/api/users/me',{method:'PUT',token:sessions.patient1,body:{name:'Updated Patient',email:'patient1@qa.test',phone:'+8801700000000',age:31,gender:'Other',address:'Updated address'}});
    response=await call('/api/users/me/notifications',{method:'PUT',token:sessions.patient1,body:{emailReminders:true,smsReminders:true,reminderHoursBefore:24}});
    check(response.status===200&&response.data.notificationPreferences.smsReminders===true,'Patient enables Twilio SMS reminders with a valid international number');
    for(let attempt=0;attempt<5;attempt+=1) await login('patient4@qa.test','WrongPassword1');
    response=await login('patient4@qa.test','Password123');
    check(response.status===429,'Repeated failed logins temporarily lock the account');

    // Protocol, payload, resilience, and basic load cases.
    response=await call('/api/health/live');
    check(response.status===200&&response.data.status==='live','Liveness endpoint reports the HTTP process');
    response=await call('/api/health/ready');
    check(response.status===200&&response.data.checks.database==='up','Readiness endpoint reports database availability');
    let raw=await rawCall('/api/health/live',{headers:{'X-Request-Id':'qa-correlation-id'}});
    check(raw.headers.get('x-request-id')==='qa-correlation-id','Request correlation ID is returned to clients');
    check(raw.headers.get('x-content-type-options')==='nosniff'&&raw.headers.get('x-frame-options')==='DENY','Security headers are applied to API responses');
    response=await call('/api/metrics');
    check(response.status===401,'Operational metrics reject unauthenticated access');
    process.env.METRICS_TOKEN='qa-metrics-token';
    raw=await rawCall('/api/metrics',{headers:{Authorization:'Bearer qa-metrics-token'}});
    check(raw.status===200&&raw.text.includes('docflow_http_requests_total'),'Authorized monitoring can read Prometheus metrics');
    delete process.env.METRICS_TOKEN;
    raw=await rawCall('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"email":'});
    check(raw.status===400,'Malformed JSON returns bad request');
    raw=await rawCall('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${'a'.repeat(110000)}@qa.test`,password:'Password123'})});
    check(raw.status===413,'Oversized JSON payload is rejected');
    raw=await rawCall('/api/auth/login',{method:'OPTIONS',headers:{Origin:'http://qa.example','Access-Control-Request-Method':'POST'}});
    check(raw.status<400&&raw.headers.get('access-control-allow-origin')==='http://qa.example','CORS preflight permits configured cross-origin access');
    const originalFindOne=User.findOne;
    User.findOne=()=>Promise.reject(new Error('Injected QA database failure'));
    response=await login('patient1@qa.test','NewPassword123');
    User.findOne=originalFindOne;
    check(response.status===500,'Database failure returns controlled server error');
    const loadStart=Date.now(); const loadResponses=await Promise.all(Array.from({length:30},()=>call('/'))); const loadElapsed=Date.now()-loadStart;
    check(loadResponses.every(item=>item.status===200)&&loadElapsed<5000,'Basic 30-request health load passes within five seconds',`${loadElapsed}ms`);
    if(process.env.QA_EMAIL_RECIPIENT&&qaMailConfig.user&&qaMailConfig.pass){
      process.env.EMAIL_USER=qaMailConfig.user;process.env.EMAIL_PASS=qaMailConfig.pass;if(qaMailConfig.from)process.env.EMAIL_FROM=qaMailConfig.from;
      const {sendRegistrationOtp}=require('../lib/mailer');
      const smtpResult=await sendRegistrationOtp(process.env.QA_EMAIL_RECIPIENT,'135790');
      check(smtpResult.accepted.includes(process.env.QA_EMAIL_RECIPIENT),'Real SMTP provider accepts QA message',JSON.stringify(smtpResult));
      delete process.env.EMAIL_USER;delete process.env.EMAIL_PASS;
    }else skip('Real SMTP provider acceptance','Set QA_EMAIL_RECIPIENT to run a live delivery handoff; inbox receipt still requires provider-side verification.');

    // Clearing every record runs last: it empties the collections the checks above rely on.
    response=await call('/api/users/admin/reset-data',{method:'POST',token:sessions.patient1,body:{confirm:'DELETE ALL DATA'}});
    check(response.status===403,'A patient cannot clear the clinic data');
    response=await call('/api/users/admin/reset-data',{method:'POST',token:sessions.admin,body:{confirm:'delete all data'}});
    check(response.status===400,'Clearing the data needs the exact confirmation phrase',JSON.stringify(response.data));
    const beforeCounts={appointments:await Appointment.countDocuments(),users:await User.countDocuments()};
    response=await call('/api/users/admin/reset-data',{method:'POST',token:sessions.admin,body:{confirm:'DELETE ALL DATA'}});
    const afterCounts={appointments:await Appointment.countDocuments(),users:await User.countDocuments()};
    check(response.status===200&&beforeCounts.appointments>0&&afterCounts.appointments===0,'Admin clears every appointment in one call',JSON.stringify({beforeCounts,afterCounts}));
    check(afterCounts.users===beforeCounts.users,'Clearing the data keeps every user account',JSON.stringify(afterCounts));
    check(response.data.deleted&&response.data.total>0&&Object.keys(response.data.deleted).length===9,'The clear reports what it removed',JSON.stringify(response.data.deleted));
    response=await call('/api/users/admin/audit',{token:sessions.admin});
    check(response.data.logs?.some(log=>log.action==='data.reset'),'The clear itself stays in the audit trail');
    response=await call('/api/auth/me',{token:sessions.admin});
    check(response.status===200,'The admin is still logged in after clearing the data');

    const passed=results.filter(item=>item.ok).length; const failed=results.filter(item=>!item.ok);
    console.log(`\nQA_RESULT ${JSON.stringify({database:QA_DB,total:results.length,passed,failed:failed.length,skipped:skipped.length,failures:failed,skips:skipped})}`);
    if(failed.length) process.exitCode=1;
  } finally {
    try { require('../lib/operations').setReady(false); } catch {}
    if (server) await new Promise(resolve=>server.close(resolve));
    if (mongoose.connection.readyState) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
  }
}

run().catch(error=>{console.error('QA runner crashed:',error);process.exitCode=1});
