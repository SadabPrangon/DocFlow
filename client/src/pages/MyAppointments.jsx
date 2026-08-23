import { CalendarClock, CheckCircle2, Clock3, Radio, Search, TriangleAlert, XCircle } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Dropdown from '../components/Dropdown';
import PageHeader from '../components/PageHeader';
import RowMenu from '../components/RowMenu';
import api from '../lib/api';

const key = (item) => `${item.appointmentDate} ${item.appointmentTime}`;
const SORTS = {
  soonest: ['Soonest first', (a, b) => key(a).localeCompare(key(b))],
  latest: ['Latest first', (a, b) => key(b).localeCompare(key(a))],
  doctor: ['Doctor A to Z', (a, b) => String(a.doctorName).localeCompare(String(b.doctorName))],
  status: ['Status', (a, b) => String(a.status).localeCompare(String(b.status))],
};

// Status carries an icon and a word as well as a colour, never colour alone.
const tone = (status) => ({
  Approved: ['ok', CheckCircle2],
  Completed: ['ok', CheckCircle2],
  Pending: ['warn', Clock3],
  Cancelled: ['bad', TriangleAlert],
  'No-show': ['bad', TriangleAlert],
}[status] || ['warn', Clock3]);

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function MyAppointments() {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null);
  const [next, setNext] = useState(null);
  const [form, setForm] = useState({ appointmentDate: '' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('soonest');
  const load = () => api.get('/appointments/mine').then((r) => setItems(r.data.appointments));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!editing || !form.appointmentDate) return setNext(null);
    const appointment = items.find((item) => item._id === editing);
    const doctorId = appointment?.doctor?._id || appointment?.doctor;
    api.get(`/users/doctors/${doctorId}/availability`, { params: { date: form.appointmentDate } }).then((r) => setNext(r.data.next)).catch(() => setNext(null));
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

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="My Appointments" backTo="/dashboard"/>
    <main className="mx-auto max-w-7xl px-6 py-10">
      {msg && <div className="rounded-xl bg-blue-50 p-3 text-blue-700">{msg}</div>}

      <div className="tbar">
        <span className="tbar-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by doctor, specialty or reason" aria-label="Search appointments"/>
        </span>
        <Dropdown
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[{ value: '', label: 'All statuses' }, ...statuses.map((item) => ({ value: item, label: item }))]}
        />
        <Dropdown
          label="Sort appointments"
          value={sort}
          onChange={setSort}
          options={Object.entries(SORTS).map(([value, [label]]) => ({ value, label }))}
        />
        {filtering && <button type="button" className="tbar-clear" onClick={() => { setQuery(''); setStatus(''); }}>Clear</button>}
        <span className="tbar-count">{visible.length} of {items.length}</span>
      </div>

      {!visible.length && <p className="tbar-empty">{items.length ? 'No appointment matches that.' : 'No appointments yet.'}</p>}

      {Boolean(visible.length) && <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Doctor</th>
              <th scope="col">Date and time</th>
              <th scope="col">Queue</th>
              <th scope="col">Status</th>
              <th scope="col" className="tbl-end"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((appointment) => {
              const [state, Icon] = tone(appointment.status);
              // Only an appointment that has not started yet can still be moved.
              const changeable = ['Pending', 'Approved'].includes(appointment.status) && !appointment.isCurrentServing;
              const queueable = appointment.status === 'Approved';
              return <Fragment key={appointment._id}>
                <tr>
                  <td>
                    <div className="tbl-name">{appointment.doctorName}</div>
                    <div className="tbl-sub">{appointment.specialty}</div>
                  </td>
                  <td className="tbl-when">
                    <div>{appointment.appointmentDate}</div>
                    <div className="tbl-sub">{appointment.appointmentTime}</div>
                  </td>
                  <td>
                    {appointment.queueNumber
                      ? <><div>#{appointment.queueNumber}</div><div className="tbl-sub">{appointment.queueStatus}</div></>
                      : <span className="tbl-sub">Not queued</span>}
                  </td>
                  <td>
                    <span className={`pill ${state}`}><Icon size={12}/>{appointment.status}</span>
                  </td>
                  <td className="tbl-end">
                    <RowMenu label={`Actions for the ${appointment.appointmentDate} appointment with ${appointment.doctorName}`} items={[
                      ...(queueable ? [{ label: 'Live queue', icon: <Radio size={14}/>, to: `/live-queue/${appointment._id}` }] : []),
                      ...(changeable ? [{ label: 'Reschedule', icon: <CalendarClock size={14}/>, onClick: () => { setEditing(editing === appointment._id ? null : appointment._id); setForm({ appointmentDate: '' }); } }] : []),
                      ...(changeable ? [{ label: 'Cancel', icon: <XCircle size={14}/>, tone: 'danger', onClick: () => cancel(appointment._id) }] : []),
                    ]}/>
                  </td>
                </tr>

                {editing === appointment._id && <tr className="tbl-edit">
                  <td colSpan={5}>
                    <form onSubmit={reschedule} className="tbl-form">
                      <label>New date
                        <input required min={localDate()} type="date" value={form.appointmentDate} onChange={(event) => setForm({ appointmentDate: event.target.value })}/>
                      </label>
                      <span className="tbl-serial">{!form.appointmentDate ? 'Pick a date to see your new serial.' : next ? `Serial #${next.serial}, at about ${next.time}.` : 'Fully booked that date.'}</span>
                      <button className="tbl-act primary" disabled={!next}>Save</button>
                      <button type="button" className="tbl-act" onClick={() => setEditing(null)}>Close</button>
                    </form>
                  </td>
                </tr>}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>}
    </main>
  </div>;
}
