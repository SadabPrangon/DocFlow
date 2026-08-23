import { Bell, CalendarDays, CheckCircle2, ClipboardList, Clock3, CreditCard, MapPin, Radio, Stethoscope, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';
import { getUser } from '../lib/auth';

const OPEN = ['Pending', 'Approved'];
const when = (appointment) => `${appointment.appointmentDate} at ${appointment.appointmentTime}`;
const ago = (value) => {
  const minutes = Math.round((Date.now() - new Date(value)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};
// Status carries an icon and a word as well as a colour, never colour alone.
const tone = (status) => ({
  Approved: ['ok', CheckCircle2],
  Completed: ['ok', CheckCircle2],
  Pending: ['warn', Clock3],
  Cancelled: ['bad', TriangleAlert],
  'No-show': ['bad', TriangleAlert],
}[status] || ['warn', Clock3]);

export default function Dashboard() {
  const user = getUser();
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [records, setRecords] = useState({ records: [], prescriptions: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.get('/appointments/mine'),
      api.get('/notifications?limit=5'),
      api.get('/clinical/history/mine'),
    ]).then(([a, n, c]) => {
      if (a.status === 'fulfilled') setAppointments(a.value.data.appointments || []);
      if (n.status === 'fulfilled') setNotifications(n.value.data.notifications || []);
      if (c.status === 'fulfilled') setRecords({ records: c.value.data.records || [], prescriptions: c.value.data.prescriptions || [] });
      setLoaded(true);
    });
  }, []);

  const open = appointments.filter((item) => OPEN.includes(item.status));
  const next = [...open].sort((a, b) => `${a.appointmentDate}${a.appointmentTime}`.localeCompare(`${b.appointmentDate}${b.appointmentTime}`))[0];
  const inQueue = appointments.find((item) => item.status === 'Approved' && item.queueNumber != null && item.queueStatus !== 'Completed');
  const unpaid = appointments.filter((item) => OPEN.includes(item.status) && item.paymentStatus !== 'Paid');
  const owed = unpaid.reduce((total, item) => total + (item.fee || 0), 0);

  const tiles = [
    ['Upcoming visits', open.length, CalendarDays, '/my-appointments'],
    ['Your queue number', inQueue ? `#${inQueue.queueNumber}` : '—', Radio, '/live-queue'],
    ['Awaiting payment', owed ? `৳${owed}` : '—', CreditCard, '/payments'],
    ['Prescriptions', records.prescriptions.length, ClipboardList, '/medical-records'],
  ];

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Patient Dashboard"/>
    <main className="dash">
      <div className="dash-head">
        <h1 className="dash-title">Good to see you, {user?.name?.split(' ')[0] || 'there'}.</h1>
        <p className="dash-sub">Here is where your care stands today.</p>
      </div>

      <section className="dash-tiles">
        {tiles.map(([label, value, Icon, to]) => <Link key={label} to={to} className="dash-tile">
          <span className="dash-tile-icon"><Icon size={15}/></span>
          <b className="dash-tile-value">{loaded ? value : '·'}</b>
          <small>{label}</small>
        </Link>)}
      </section>

      <div className="dash-grid">
        <section className="dash-card">
          <h2 className="dash-card-title">Next visit</h2>
          {next ? <>
            <div className="dash-visit">
              <span className="dash-visit-mark"><Stethoscope size={16}/></span>
              <span className="dash-visit-copy">
                <b>{next.doctorName}</b>
                <small>{next.specialty || 'General Medicine'}</small>
              </span>
              {(() => { const [state, Icon] = tone(next.status); return <span className={`dash-pill ${state}`}><Icon size={12}/>{next.status}</span>; })()}
            </div>
            <p className="dash-meta"><CalendarDays size={13}/>{when(next)}<MapPin size={13}/>{next.location || 'DocFlow Clinic'}</p>

            {inQueue && inQueue._id === next._id && <div className="dash-queue">
              <span><small>Now serving</small><b>{inQueue.currentServing != null ? `#${inQueue.currentServing}` : 'Not started'}</b></span>
              <span><small>Your number</small><b>#{inQueue.queueNumber}</b></span>
              <span><small>Ahead of you</small><b>{inQueue.peopleBeforeYou ?? 0}</b></span>
              <span><small>Estimated wait</small><b>{inQueue.estimatedWait ? `${inQueue.estimatedWait} min` : 'Soon'}</b></span>
            </div>}

            <div className="dash-actions">
              {next.status === 'Approved' && <Link to={`/live-queue/${next._id}`} className="dash-action primary"><Radio size={14}/>Live queue</Link>}
              <Link to="/my-appointments" className="dash-action">Manage</Link>
              {next.paymentStatus !== 'Paid' && next.fee > 0 && <Link to="/payments" className="dash-action"><CreditCard size={14}/>Pay ৳{next.fee}</Link>}
            </div>
          </> : <p className="dash-empty">{loaded ? 'No upcoming visits. Book one when you need to be seen.' : 'Loading your appointments…'}</p>}
        </section>

        <section className="dash-card">
          <h2 className="dash-card-title">Recent activity</h2>
          {notifications.length ? <ul className="dash-feed">
            {notifications.map((item) => <li key={item._id}>
              <span className={`dash-feed-dot ${item.read ? '' : 'unread'}`}><Bell size={12}/></span>
              <span className="dash-feed-copy">
                <b>{item.title}</b>
                <small>{item.message}</small>
              </span>
              <small className="dash-feed-time">{ago(item.createdAt)}</small>
            </li>)}
          </ul> : <p className="dash-empty">{loaded ? 'Nothing new yet.' : 'Loading…'}</p>}
        </section>
      </div>
    </main>
  </div>;
}
