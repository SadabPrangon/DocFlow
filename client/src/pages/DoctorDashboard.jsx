import { CalendarDays, CheckCircle2, Clock3, Radio, Stethoscope, TriangleAlert, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { getUser } from '../lib/auth';
import api from '../lib/api';

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const OPEN = ['Pending', 'Approved'];

// Status carries an icon and a word as well as a colour, never colour alone.
const tone = (status) => ({
  Approved: ['ok', CheckCircle2],
  Completed: ['ok', CheckCircle2],
  Pending: ['warn', Clock3],
  Cancelled: ['bad', TriangleAlert],
  'No-show': ['bad', TriangleAlert],
}[status] || ['warn', Clock3]);

export default function DoctorDashboard() {
  const user = getUser();
  const [items, setItems] = useState([]); const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ doctorNotes: '', prescription: '' });
  const [msg, setMsg] = useState('');
  const load = () => api.get('/appointments/doctor/mine').then((r) => setItems(r.data.appointments)).finally(() => setLoaded(true));
  useEffect(() => { load(); }, []);
  const save = async (id) => { const { data } = await api.put(`/appointments/${id}/doctor-update`, form); setMsg(data.message); setEditing(null); load(); };
  const complete = async (id) => { const { data } = await api.put(`/appointments/${id}/advance`, { action: 'complete', ...form }); setMsg(data.message); setEditing(null); load(); };

  const today = localDate();
  const todays = items.filter((item) => item.appointmentDate === today);
  const serving = todays.find((item) => item.isCurrentServing);
  const waiting = todays.filter((item) => item.status === 'Approved' && item.queueStatus === 'Waiting');
  const seen = todays.filter((item) => item.status === 'Completed');
  const awaiting = items.filter((item) => item.status === 'Pending');
  const upcoming = items
    .filter((item) => OPEN.includes(item.status) && item.appointmentDate > today)
    .sort((a, b) => `${a.appointmentDate} ${a.appointmentTime}`.localeCompare(`${b.appointmentDate} ${b.appointmentTime}`));

  const tiles = [
    ['Booked today', todays.filter((item) => OPEN.includes(item.status) || item.status === 'Completed').length, CalendarDays],
    ['Still waiting', waiting.length, Users],
    ['Seen today', seen.length, CheckCircle2],
    ['Awaiting approval', awaiting.length, Clock3],
  ];

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Doctor Dashboard"/>
    <main className="dash">
      <div className="dash-head">
        {/* A doctor's name usually starts with a title, so first-name-only reads as "Dr". */}
        <h1 className="dash-title">Good to see you, {user?.name || 'doctor'}.</h1>
        <p className="dash-sub">Here is how your clinic stands today.</p>
      </div>
      {msg && <div className="mt-4 rounded-xl bg-blue-50 p-3 text-blue-700">{msg}</div>}

      <section className="dash-tiles">
        {tiles.map(([label, value, Icon]) => <div key={label} className="dash-tile">
          <span className="dash-tile-icon"><Icon size={15}/></span>
          <b className="dash-tile-value">{loaded ? value : '·'}</b>
          <small>{label}</small>
        </div>)}
      </section>

      <div className="dash-grid">
        <section className="dash-card">
          <h2 className="dash-card-title">With you now</h2>
          {serving ? <>
            <div className="dash-visit">
              <span className="dash-visit-mark"><UserRound size={16}/></span>
              <span className="dash-visit-copy">
                <b>{serving.patient?.name || 'Patient'}</b>
                <small>Queue #{serving.queueNumber ?? '—'} · booked for {serving.appointmentTime}</small>
              </span>
              {(() => { const [state, Icon] = tone(serving.status); return <span className={`dash-pill ${state}`}><Icon size={12}/>{serving.status}</span>; })()}
            </div>
            <div className="dash-queue">
              <span><small>Serial</small><b>{serving.serial ? `#${serving.serial}` : '—'}</b></span>
              <span><small>Still waiting</small><b>{waiting.length}</b></span>
              <span><small>Seen today</small><b>{seen.length}</b></span>
              <span><small>Next at</small><b>{waiting[0]?.appointmentTime || '—'}</b></span>
            </div>
            <div className="dash-actions">
              <Link to="/clinical-workspace" className="dash-action primary"><Stethoscope size={14}/>Open workspace</Link>
              <Link to="/availability" className="dash-action"><CalendarDays size={14}/>Schedule</Link>
            </div>
          </> : <>
            <p className="dash-empty">{loaded ? 'Nobody is with you right now.' : 'Loading your list…'}</p>
            <div className="dash-actions">
              <Link to="/clinical-workspace" className="dash-action primary"><Stethoscope size={14}/>Open workspace</Link>
              <Link to="/availability" className="dash-action"><CalendarDays size={14}/>Schedule</Link>
            </div>
          </>}
        </section>

        <section className="dash-card">
          <h2 className="dash-card-title">Today's list</h2>
          {todays.length ? <ul className="dash-feed">
            {todays.map((item) => {
              const [state, Icon] = tone(item.status);
              return <li key={item._id}>
                <span className={`dash-feed-dot ${item.isCurrentServing ? 'unread' : ''}`}><Radio size={12}/></span>
                <span className="dash-feed-copy">
                  <b>{item.patient?.name || 'Patient'}</b>
                  <small>{item.appointmentTime} · queue {item.queueNumber ? `#${item.queueNumber}` : 'not assigned'}</small>
                </span>
                <span className={`dash-pill ${state}`}><Icon size={12}/>{item.status}</span>
              </li>;
            })}
          </ul> : <p className="dash-empty">{loaded ? 'Nothing booked for today.' : 'Loading your list…'}</p>}
          {Boolean(upcoming.length) && <p className="dash-meta"><CalendarDays size={13}/>Next after today: {upcoming[0].patient?.name || 'a patient'} on {upcoming[0].appointmentDate} at {upcoming[0].appointmentTime}</p>}
        </section>
      </div>

      <div className="mt-7 space-y-5">{items.map((a) => <article key={a._id} className="rounded-3xl bg-white p-6 shadow"><div className="flex justify-between"><div><h2 className="text-xl font-bold">{a.patient?.name}</h2><p className="text-slate-500">{a.appointmentDate} · {a.appointmentTime} · Queue #{a.queueNumber || '-'}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{a.status} / {a.queueStatus}</span></div><p className="mt-4 rounded-xl bg-slate-50 p-4"><b>Reason:</b> {a.reason || 'not given at booking'}</p>{editing === a._id ? <div className="mt-4 grid gap-4"><textarea placeholder="Doctor notes" value={form.doctorNotes} onChange={(e) => setForm({ ...form, doctorNotes: e.target.value })} className="rounded-xl border p-3"/><textarea placeholder="Prescription" value={form.prescription} onChange={(e) => setForm({ ...form, prescription: e.target.value })} className="rounded-xl border p-3"/><div className="flex gap-3"><button onClick={() => save(a._id)} className="rounded-xl border px-4 py-2">Save Notes</button>{a.isCurrentServing && <button onClick={() => complete(a._id)} className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white">Complete Consultation</button>}</div></div> : <button onClick={() => { setEditing(a._id); setForm({ doctorNotes: a.doctorNotes || '', prescription: a.prescription || '' }); }} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Open Consultation</button>}</article>)}</div>
    </main>
  </div>;
}
