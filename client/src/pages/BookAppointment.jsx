import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function BookAppointment() {
  const { doctorId } = useParams();
  const nav = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ appointmentDate: '', appointmentTime: '', reason: '', paymentMethod: 'cash' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);

  useEffect(() => { api.get('/users/doctors').then((r) => setDoctor(r.data.doctors.find((d) => d.id === doctorId))); }, [doctorId]);
  useEffect(() => {
    if (!form.appointmentDate) { setSlots([]); return; }
    setLoadingSlots(true);
    api.get(`/users/doctors/${doctorId}/availability`, { params: { date: form.appointmentDate } })
      .then((r) => setSlots(r.data.slots))
      .catch((error) => { setSlots([]); setErr(true); setMsg(error.response?.data?.message || 'Unable to load times.'); })
      .finally(() => setLoadingSlots(false));
  }, [doctorId, form.appointmentDate]);
  const submit = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/appointments', { doctorId, ...form });
      setErr(false); setMsg(data.message); setTimeout(() => nav('/my-appointments'), 900);
    } catch (error) { setErr(true); setMsg(error.response?.data?.message || 'Unable to book.'); }
  };

  return <div className="min-h-screen bg-slate-100"><PageHeader title="Book Appointment" backTo="/doctors"/><main className="mx-auto max-w-4xl px-6 py-10"><div className="grid gap-8 lg:grid-cols-3"><aside className="rounded-3xl bg-slate-950 p-7 text-white"><h2 className="text-2xl font-bold">{doctor?.name || 'Loading doctor...'}</h2><p className="mt-1 text-cyan-300">{doctor?.specialty}</p><p className="mt-5 text-slate-400">{doctor?.location}</p><p className="mt-4 text-2xl font-bold">৳{doctor?.fee || 0}</p></aside><form onSubmit={submit} className="rounded-3xl bg-white p-7 shadow lg:col-span-2"><h1 className="text-3xl font-bold">Appointment details</h1>{msg && <div className={`mt-5 rounded-xl p-3 ${err ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}<label className="mt-6 block font-semibold">Date<input required min={localDate()} type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value, appointmentTime: '' })} className="mt-2 w-full rounded-xl border px-4 py-3"/></label><label className="mt-5 block font-semibold">Available time<select required disabled={!form.appointmentDate || loadingSlots} value={form.appointmentTime} onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="">{loadingSlots ? 'Loading available times…' : slots.length ? 'Select time' : form.appointmentDate ? 'No times available' : 'Choose a date first'}</option>{slots.map((time) => <option key={time}>{time}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">Times shown in {doctor?.availability?.timezone || 'Asia/Dhaka'}.</p><label className="mt-5 block font-semibold">Reason<textarea required maxLength={1000} rows="4" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"/></label><label className="mt-5 block font-semibold">Payment method<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="cash">Cash</option><option value="online">Online (demo status only)</option></select></label><button disabled={!form.appointmentTime} className="mt-7 w-full rounded-2xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-50">Confirm Appointment</button></form></div></main></div>;
}
