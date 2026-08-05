import { CalendarDays, Clock3, Hash, Radio, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

export default function LiveQueue() {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setMessage('');
      if (appointmentId) {
        const { data } = await api.get(`/appointments/${appointmentId}`);
        setAppointment(data.appointment);
      } else {
        const { data } = await api.get('/appointments/mine');
        setAvailable(data.appointments.filter((item) => item.status === 'Approved' && item.queueNumber));
      }
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load queue information.');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, [load]);

  if (!appointmentId) return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Live Queue" backTo="/dashboard"/>
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-semibold text-blue-600">Patient queue tracking</p>
      <h1 className="mt-2 text-3xl font-bold">Live Queue</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Open an approved appointment to see the number currently being served, your queue number, and estimated waiting time.</p>
      {message && <p className="mt-6 rounded-2xl bg-red-50 p-4 text-red-700">{message}</p>}
      {loading ? <p className="mt-8 rounded-3xl bg-white p-8 shadow">Loading available queues...</p> : <div className="mt-8 grid gap-5 md:grid-cols-2">
        {available.map((item) => <article key={item._id} className="rounded-3xl bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{item.doctorName}</h2><p className="font-semibold text-blue-600">{item.specialty}</p></div><span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">{item.queueStatus}</span></div>
          <p className="mt-5 flex items-center gap-2 text-slate-600"><CalendarDays size={18}/>{item.appointmentDate} at {item.appointmentTime}</p>
          <p className="mt-3 flex items-center gap-2 font-bold text-slate-800"><Hash size={18}/>Your queue number: {item.queueNumber}</p>
          <Link to={`/live-queue/${item._id}`} className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"><Radio size={18}/>Open live tracker</Link>
        </article>)}
        {!available.length && !message && <div className="rounded-3xl bg-white p-10 text-center shadow md:col-span-2"><Radio className="mx-auto text-slate-400" size={32}/><h2 className="mt-4 text-xl font-bold">No live queues available</h2><p className="mt-2 text-slate-600">A queue will appear here after the clinic approves your appointment and assigns a queue number.</p><Link to="/my-appointments" className="mt-5 inline-flex rounded-xl border px-5 py-3 font-semibold text-blue-600">View appointments</Link></div>}
      </div>}
    </main>
  </div>;

  if (message) return <div className="min-h-screen bg-slate-100"><PageHeader title="Live Queue" backTo="/live-queue"/><p className="mx-auto mt-10 max-w-xl rounded-2xl bg-red-50 p-5 text-red-700">{message}</p></div>;
  if (loading || !appointment) return <div className="min-h-screen bg-slate-100"><PageHeader title="Live Queue" backTo="/live-queue"/><p className="p-10">Loading queue...</p></div>;

  return <div className="min-h-screen bg-slate-100"><PageHeader title="Live Queue" backTo="/live-queue"/><main className="mx-auto max-w-6xl px-6 py-10"><div className="flex items-end justify-between"><div><p className="font-semibold text-blue-600">Live appointment queue</p><h1 className="mt-2 text-3xl font-bold">Track Your Queue</h1></div><button onClick={load} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 font-semibold"><RefreshCw size={18}/>Refresh</button></div><div className="mt-8 grid gap-6 lg:grid-cols-3"><section className="rounded-3xl bg-white p-7 shadow lg:col-span-2"><div className="flex justify-between border-b pb-5"><div><h2 className="text-2xl font-bold">{appointment.doctorName}</h2><p className="font-semibold text-blue-600">{appointment.specialty}</p><p className="mt-2 text-slate-500">{appointment.appointmentDate} at {appointment.appointmentTime}</p></div><span className="h-fit rounded-full bg-green-100 px-4 py-2 text-green-700">{appointment.queueStatus}</span></div><div className="mt-7 grid gap-5 sm:grid-cols-2"><div className="rounded-3xl bg-slate-950 p-6 text-white"><p className="flex gap-2 text-slate-300"><Hash size={20}/>Now serving</p><p className="mt-4 text-6xl font-bold">{appointment.currentServing ? String(appointment.currentServing).padStart(2, '0') : '--'}</p></div><div className="rounded-3xl bg-blue-600 p-6 text-white"><p className="flex gap-2 text-blue-100"><Hash size={20}/>Your number</p><p className="mt-4 text-6xl font-bold">{String(appointment.queueNumber || 0).padStart(2, '0')}</p></div></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-5"><p className="flex gap-2 text-slate-500"><Users size={20}/>People before you</p><b className="mt-3 block text-3xl">{appointment.peopleBeforeYou || 0}</b></div><div className="rounded-2xl bg-slate-50 p-5"><p className="flex gap-2 text-slate-500"><Clock3 size={20}/>Estimated wait</p><b className="mt-3 block text-3xl">{appointment.estimatedWait || 0} min</b></div></div></section><aside className="rounded-3xl bg-white p-6 shadow"><h2 className="text-xl font-bold">Queue information</h2><div className="mt-5 space-y-4 text-sm text-slate-600"><p className="rounded-2xl bg-blue-50 p-4">This page refreshes every 7 seconds.</p><p className="rounded-2xl bg-slate-50 p-4">Stay nearby when your number is close.</p><p className="rounded-2xl bg-slate-50 p-4">Waiting time uses an estimate of 5 minutes per patient.</p></div></aside></div></main></div>;
}
