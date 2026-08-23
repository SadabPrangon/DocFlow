import { CalendarClock, CalendarDays, Clock, MapPin, Radio, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Dropdown from '../components/Dropdown';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const key = (item) => `${item.appointmentDate} ${item.appointmentTime}`;
const SORTS = {
  soonest: ['Soonest first', (a, b) => key(a).localeCompare(key(b))],
  latest: ['Latest first', (a, b) => key(b).localeCompare(key(a))],
  doctor: ['Doctor A to Z', (a, b) => String(a.doctorName).localeCompare(String(b.doctorName))],
  status: ['Status', (a, b) => String(a.status).localeCompare(String(b.status))],
};

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function MyAppointments() {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null);
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({ appointmentDate: '', appointmentTime: '' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('soonest');
  const load = () => api.get('/appointments/mine').then((r) => setItems(r.data.appointments));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!editing || !form.appointmentDate) return setSlots([]);
    const appointment = items.find((item) => item._id === editing);
    const doctorId = appointment?.doctor?._id || appointment?.doctor;
    api.get(`/users/doctors/${doctorId}/availability`, { params: { date: form.appointmentDate } }).then((r) => setSlots(r.data.slots)).catch(() => setSlots([]));
  }, [editing, form.appointmentDate, items]);
  const cancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    try { const { data } = await api.put(`/appointments/${id}/cancel`, { reason: 'Cancelled by patient' }); setMsg(data.message); load(); }
    catch (error) { setMsg(error.response?.data?.message || 'Unable to cancel.'); }
  };
  const reschedule = async (event) => {
    event.preventDefault();
    try { const { data } = await api.put(`/appointments/${editing}/reschedule`, form); setMsg(data.message); setEditing(null); load(); }
    catch (error) { setMsg(error.response?.data?.message || 'Unable to reschedule.'); }
  };
  const statuses = useMemo(() => [...new Set(items.map((item) => item.status))].sort(), [items]);
  // The endpoint returns this patient's whole history, so it is filtered here.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => !status || item.status === status)
      .filter((item) => !needle || [item.doctorName, item.specialty, item.reason, item.location]
        .some((field) => String(field || '').toLowerCase().includes(needle)))
      .sort(SORTS[sort][1]);
  }, [items, query, status, sort]);
  const filtering = Boolean(query.trim() || status);

  const color = (status) => status === 'Approved' ? 'bg-blue-100 text-blue-700' : status === 'Completed' ? 'bg-green-100 text-green-700' : status === 'Cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';

  return <div className="min-h-screen bg-slate-100"><PageHeader title="My Appointments" backTo="/dashboard"/><main className="mx-auto max-w-6xl px-6 py-10">{msg && <div className="mt-5 rounded-xl bg-blue-50 p-3 text-blue-700">{msg}</div>}<div className="tbar"><span className="tbar-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by doctor, specialty or reason" aria-label="Search appointments"/></span><Dropdown label="Filter by status" value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...statuses.map((item) => ({ value: item, label: item }))]}/><Dropdown label="Sort appointments" value={sort} onChange={setSort} options={Object.entries(SORTS).map(([value, [label]]) => ({ value, label }))}/>{filtering && <button type="button" className="tbar-clear" onClick={() => { setQuery(''); setStatus(''); }}>Clear</button>}<span className="tbar-count">{visible.length} of {items.length}</span></div>{!visible.length && <p className="tbar-empty">{items.length ? 'No appointment matches that.' : 'No appointments yet.'}</p>}<div className="mt-5 grid gap-6 md:grid-cols-2">{visible.map((a) => <article key={a._id} className="rounded-3xl bg-white p-6 shadow"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-bold">{a.doctorName}</h2><p className="font-semibold text-blue-600">{a.specialty}</p></div><span className={`h-fit rounded-full px-3 py-1 text-sm font-semibold ${color(a.status)}`}>{a.status}</span></div><div className="mt-5 space-y-3 text-slate-600"><p className="flex gap-3"><CalendarDays size={18}/>{a.appointmentDate}</p><p className="flex gap-3"><Clock size={18}/>{a.appointmentTime}</p><p className="flex gap-3"><MapPin size={18}/>{a.location}</p></div><div className="mt-5 rounded-2xl bg-slate-50 p-4"><b>Reason</b><p className="mt-1">{a.reason}</p></div>{a.queueNumber && <p className="mt-4 font-bold text-blue-600">Queue #{a.queueNumber} · {a.queueStatus}</p>}{editing === a._id ? <form onSubmit={reschedule} className="mt-5 rounded-2xl border p-4"><h3 className="font-bold">Choose a new time</h3><input required min={localDate()} type="date" value={form.appointmentDate} onChange={(e) => setForm({ appointmentDate: e.target.value, appointmentTime: '' })} className="mt-3 w-full rounded-xl border px-3 py-2"/><select required value={form.appointmentTime} onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })} className="mt-3 w-full rounded-xl border px-3 py-2"><option value="">Select available time</option>{slots.map((time) => <option key={time}>{time}</option>)}</select><div className="mt-3 flex gap-2"><button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Save</button><button type="button" onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2">Close</button></div></form> : <div className="mt-5 flex flex-wrap gap-3">{a.status === 'Approved' && <Link to={`/live-queue/${a._id}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"><Radio size={18}/>Live Queue</Link>}{['Pending', 'Approved'].includes(a.status) && !a.isCurrentServing && <button onClick={() => { setEditing(a._id); setForm({ appointmentDate: '', appointmentTime: '' }); }} className="flex items-center gap-2 rounded-xl border px-4 py-3 font-semibold text-blue-600"><CalendarClock size={18}/>Reschedule</button>}{['Pending', 'Approved'].includes(a.status) && !a.isCurrentServing && <button onClick={() => cancel(a._id)} className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600"><XCircle size={18}/>Cancel</button>}</div>}{a.prescription && <div className="mt-4 rounded-2xl bg-green-50 p-4"><b>Prescription</b><p>{a.prescription}</p></div>}</article>)}{items.length === 0 && <div className="rounded-3xl bg-white p-10 text-center shadow">No appointments yet.</div>}</div></main></div>;
}
