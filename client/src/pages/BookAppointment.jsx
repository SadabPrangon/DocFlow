import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function BookAppointment() {
  const { doctorId } = useParams();
  const nav = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [next, setNext] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ appointmentDate: '', paymentMethod: 'cash' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/users/doctors').then((r) => setDoctor(r.data.doctors.find((d) => d.id === doctorId))); }, [doctorId]);
  useEffect(() => {
    if (!form.appointmentDate) { setNext(null); return; }
    setLoadingSlots(true);
    api.get(`/users/doctors/${doctorId}/availability`, { params: { date: form.appointmentDate } })
      .then((r) => { setNext(r.data.next); setMsg(''); })
      .catch((error) => { setNext(null); setErr(true); setMsg(error.response?.data?.message || 'Unable to load that date.'); })
      .finally(() => setLoadingSlots(false));
  }, [doctorId, form.appointmentDate]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    let booked;
    try {
      const { data } = await api.post('/appointments', { doctorId, ...form });
      booked = data.appointment;
      setErr(false); setMsg(data.message);
    } catch (error) {
      setBusy(false); setErr(true);
      return setMsg(error.response?.data?.message || 'Unable to book.');
    }

    if (form.paymentMethod !== 'online') { setTimeout(() => nav('/my-appointments'), 900); return; }
    // The appointment is already booked. Paying is the next step, so a gateway
    // that will not open leaves the patient with a booking, not an error.
    try {
      setMsg('Taking you to the secure payment page…');
      const { data } = await api.post(`/payments/appointments/${booked._id}/checkout`);
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setBusy(false); setErr(true);
      setMsg(`${error.response?.data?.message || 'Unable to open the payment page.'} Your serial is booked — you can pay from Payments & calendar.`);
      setTimeout(() => nav('/payments'), 2500);
    }
  };

  return <div className="min-h-screen bg-slate-100"><PageHeader title="Book Appointment" backTo="/doctors"/><main className="mx-auto max-w-4xl px-6 py-10"><div className="grid gap-8 lg:grid-cols-3"><aside className="rounded-3xl bg-slate-950 p-7 text-white"><h2 className="text-2xl font-bold">{doctor?.name || 'Loading doctor...'}</h2><p className="mt-1 text-cyan-300">{doctor?.specialty}</p><p className="mt-5 text-slate-400">{doctor?.location}</p><p className="mt-4 text-2xl font-bold">৳{doctor?.fee || 0}</p></aside><form onSubmit={submit} className="rounded-3xl bg-white p-7 shadow lg:col-span-2"><h1 className="text-3xl font-bold">Appointment details</h1>{msg && <div className={`mt-5 rounded-xl p-3 ${err ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg}</div>}<label className="mt-6 block font-semibold">Date<input required min={localDate()} type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"/></label><div className="serial">{!form.appointmentDate ? <p className="serial-empty">Choose a date to see your serial.</p> : loadingSlots ? <p className="serial-empty">Working out your serial…</p> : next ? <><p className="serial-label">Your serial is #{next.serial}</p><p className="serial-time">At about <b>{next.time}</b>, place {next.serial} of {next.of} that day.</p></> : <p className="serial-empty bad">This doctor is fully booked on that date. Choose another date.</p>}</div><label className="mt-5 block font-semibold">Payment method<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="mt-2 w-full rounded-xl border px-4 py-3"><option value="cash">Cash</option><option value="online">Online (SSLCommerz)</option></select></label><button disabled={!next || busy} className="mt-7 w-full rounded-2xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : form.paymentMethod === 'online' ? 'Confirm and pay' : 'Confirm Appointment'}</button></form></div></main></div>;
}
