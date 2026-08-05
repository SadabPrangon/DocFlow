import { ArrowLeft, ArrowRight, CalendarDays, Check, KeyRound, LockKeyhole, Mail, MapPin, RefreshCw, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

const readFlow = () => { try { return JSON.parse(sessionStorage.getItem('docflow-registration')) || {}; } catch { return {}; } };
const saveFlow = value => sessionStorage.setItem('docflow-registration', JSON.stringify(value));
const ageFromDob = value => {
  if (!value) return '';
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) return '';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : '';
};

function RegistrationShell({ step, children }) {
  return <div className="soft-grid flex min-h-screen items-center justify-center bg-slate-100 px-5 py-12"><div className="app-card w-full max-w-2xl rounded-3xl p-7 sm:p-10"><div className="flex items-center justify-between"><Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600"><ArrowLeft size={16}/>Back home</Link><span className="brand-mark"><Stethoscope size={18}/></span></div><div className="mt-8 flex gap-2" aria-label={`Registration step ${step} of 3`}>{[1,2,3].map(item=><span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? 'bg-indigo-600' : 'bg-slate-200'}`}/>)}</div>{children}</div></div>;
}

export default function RegistrationFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const step = location.pathname.endsWith('/verify') ? 2 : location.pathname.endsWith('/complete') ? 3 : 1;
  const [flow, setFlow] = useState(readFlow);
  const [email, setEmail] = useState(flow.email || '');
  const [otp, setOtp] = useState('');
  const [form, setForm] = useState({ fullName: '', dateOfBirth: '', address: '', password: '', confirmPassword: '' });
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((new Date(flow.expiresAt || 0).getTime() - Date.now()) / 1000)));
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const age = useMemo(() => ageFromDob(form.dateOfBirth), [form.dateOfBirth]);

  useEffect(() => {
    if (step === 2 && !flow.email) navigate('/register', { replace: true });
    if (step === 3 && (!flow.email || !flow.registrationToken)) navigate('/register', { replace: true });
  }, [step, flow, navigate]);
  useEffect(() => {
    if (step !== 2) return undefined;
    const update = () => setSeconds(Math.max(0, Math.ceil((new Date(flow.expiresAt || 0).getTime() - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [step, flow.expiresAt]);

  const requestOtp = async event => {
    event?.preventDefault(); setLoading(true); setMessage('');
    try {
      const targetEmail = step === 2 ? flow.email : email;
      const { data } = await api.post('/auth/register/request-otp', { email: targetEmail });
      const next = { email: targetEmail.trim().toLowerCase(), expiresAt: data.expiresAt };
      saveFlow(next); setFlow(next); setError(false); setMessage(data.message); setOtp(''); navigate('/register/verify');
    } catch (err) {
      const data = err.response?.data;
      if (data?.expiresAt) { const next = { email: (step === 2 ? flow.email : email).trim().toLowerCase(), expiresAt: data.expiresAt }; saveFlow(next); setFlow(next); }
      setError(true); setMessage(data?.message || 'Unable to send a verification code.');
    } finally { setLoading(false); }
  };
  const verifyOtp = async event => {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const { data } = await api.post('/auth/register/verify-otp', { email: flow.email, otp });
      const next = { ...flow, registrationToken: data.registrationToken };
      saveFlow(next); setFlow(next); setError(false); navigate('/register/complete');
    } catch (err) { setError(true); setMessage(err.response?.data?.message || 'Unable to verify the code.'); }
    finally { setLoading(false); }
  };
  const complete = async event => {
    event.preventDefault(); setLoading(true); setMessage('');
    if (!window.confirm('I have read and accept the DocFlow privacy notice and consent to processing my information for healthcare services.')) { setLoading(false); setError(true); setMessage('Privacy consent is required to create an account.'); return; }
    try {
      const { data } = await api.post('/auth/register/complete', { email: flow.email, registrationToken: flow.registrationToken, ...form, privacyConsent: true });
      sessionStorage.removeItem('docflow-registration'); setError(false); setMessage(data.message); setTimeout(() => navigate('/login'), 1000);
    } catch (err) { setError(true); setMessage(err.response?.data?.message || 'Unable to create your account.'); }
    finally { setLoading(false); }
  };
  const changeEmail = () => { sessionStorage.removeItem('docflow-registration'); setFlow({}); setOtp(''); setMessage(''); navigate('/register'); };
  const notice = message && <div className={`mt-5 rounded-xl border p-3.5 text-sm font-medium ${error ? 'border-red-100 bg-red-50 text-red-700' : 'border-green-100 bg-green-50 text-green-700'}`}>{message}</div>;

  if (step === 1) return <RegistrationShell step={1}><p className="eyebrow mt-8">Create your account</p><h1 className="page-title mt-2 text-4xl font-extrabold">Start with your email</h1><p className="mt-3 text-slate-500">We’ll send a secure, one-time verification code to this address.</p>{notice}<form onSubmit={requestOtp}><label className="mt-7 block text-sm font-bold text-slate-700">Email address<div className="relative mt-2"><Mail className="absolute left-4 top-3.5 text-slate-400" size={19}/><input required autoFocus type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border py-3 pl-12 pr-4" placeholder="you@example.com"/></div></label><button disabled={loading} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60">{loading ? 'Sending code…' : <>Send verification code <ArrowRight size={17}/></>}</button></form><p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-bold text-indigo-600">Log in</Link></p></RegistrationShell>;

  if (step === 2) return <RegistrationShell step={2}><span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><ShieldCheck size={23}/></span><h1 className="page-title mt-5 text-4xl font-extrabold">Check your email</h1><p className="mt-3 text-slate-500">Enter the 6-digit code sent to <b className="text-slate-700">{flow.email}</b>.</p>{notice}<form onSubmit={verifyOtp}><label className="mt-7 block text-sm font-bold text-slate-700">Verification code<input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border px-4 py-3 text-center text-2xl font-extrabold tracking-[.5em]" placeholder="000000"/></label><div className={`mt-4 rounded-xl p-3 text-center text-sm font-bold ${seconds ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-700'}`}>{seconds ? <>Code expires in {String(Math.floor(seconds / 60)).padStart(2,'0')}:{String(seconds % 60).padStart(2,'0')}</> : 'This code has expired'}</div><button disabled={loading || otp.length !== 6 || seconds === 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-50"><KeyRound size={17}/>{loading ? 'Verifying…' : 'Verify email'}</button></form><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button disabled={seconds > 0 || loading} onClick={requestOtp} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><RefreshCw size={16}/>Resend OTP</button><button onClick={changeEmail} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"><Mail size={16}/>Change email</button></div></RegistrationShell>;

  return <RegistrationShell step={3}><span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-green-50 text-green-600"><Check size={23}/></span><p className="eyebrow mt-5">Email verified</p><h1 className="page-title mt-2 text-4xl font-extrabold">Complete your profile</h1><p className="mt-3 text-slate-500">Tell us a little about yourself and secure your account.</p>{notice}<form onSubmit={complete}><div className="mt-7 grid gap-5 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Full name<div className="relative mt-2"><UserRound className="absolute left-4 top-3.5 text-slate-400" size={18}/><input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} className="w-full rounded-xl border py-3 pl-12 pr-4"/></div></label><label className="text-sm font-bold text-slate-700">Date of birth<div className="relative mt-2"><CalendarDays className="absolute left-4 top-3.5 text-slate-400" size={18}/><input required type="date" max={new Date().toISOString().split('T')[0]} value={form.dateOfBirth} onChange={e=>setForm({...form,dateOfBirth:e.target.value})} className="w-full rounded-xl border py-3 pl-12 pr-4"/></div>{age !== '' && <span className="mt-1.5 block text-xs font-medium text-indigo-600">Calculated age: {age} years</span>}</label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Address <span className="font-normal text-slate-400">(optional)</span><div className="relative mt-2"><MapPin className="absolute left-4 top-3.5 text-slate-400" size={18}/><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full rounded-xl border py-3 pl-12 pr-4" placeholder="Your current address"/></div></label><label className="text-sm font-bold text-slate-700">Password<div className="relative mt-2"><LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={18}/><input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="w-full rounded-xl border py-3 pl-12 pr-4" placeholder="At least 8 characters"/></div></label><label className="text-sm font-bold text-slate-700">Confirm password<div className="relative mt-2"><LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={18}/><input required minLength="8" type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} className="w-full rounded-xl border py-3 pl-12 pr-4"/></div></label></div><button disabled={loading || form.password !== form.confirmPassword} className="mt-8 w-full rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-50">{loading ? 'Creating account…' : 'Create patient account'}</button></form></RegistrationShell>;
}
