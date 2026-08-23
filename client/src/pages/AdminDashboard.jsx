import { Activity, Stethoscope, TriangleAlert, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [phrase, setPhrase] = useState(''); const [wiping, setWiping] = useState(false); const [wipeMsg, setWipeMsg] = useState('');
  const load = () => api.get('/users/admin/stats').then(({ data }) => setStats(data.stats || {}));
  useEffect(() => { load(); }, []);
  // Clearing is one button, but the phrase has to be typed: none of it can be undone.
  const clearData = async () => {
    setWiping(true);
    try {
      const { data } = await api.post('/users/admin/reset-data', { confirm: phrase });
      setWipeMsg(data.message); setPhrase(''); load();
    } catch (error) { setWipeMsg(error.response?.data?.message || 'Unable to clear the data.'); }
    setWiping(false);
  };

  return <div className="min-h-screen bg-slate-100"><PageHeader title="Admin Dashboard"/><main className="mx-auto max-w-7xl px-6 py-10"><div className="mt-6 grid gap-5 md:grid-cols-4">{[[Users, 'Patients', stats.patients], [Stethoscope, 'Doctors', stats.doctors], [UserCog, 'Receptionists', stats.receptionists], [Activity, 'Appointments', stats.appointments]].map(([Icon, label, value]) => <div key={label} className="rounded-3xl bg-white p-6 shadow"><Icon className="text-blue-600"/><p className="mt-3 text-sm text-slate-500">{label}</p><b className="text-3xl">{value ?? 0}</b></div>)}</div><p className="dash-sub mt-6">Accounts live in the Users module. This page is the shape of the clinic and the controls that affect all of it.</p><section className="wipe"><div><h2 className="wipe-title"><TriangleAlert size={15}/>Clear all clinic data</h2><p className="wipe-note">Deletes every appointment, queue, payment, message, medical record, prescription, notification and assistant chat, for every user. User accounts and doctor schedules are kept. There is no undo.</p>{wipeMsg && <p className="wipe-result">{wipeMsg}</p>}</div><div className="wipe-controls"><input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="Type DELETE ALL DATA" aria-label="Type DELETE ALL DATA to confirm"/><button type="button" className="wipe-button" disabled={phrase !== 'DELETE ALL DATA' || wiping} onClick={clearData}>{wiping ? 'Clearing…' : 'Clear all data'}</button></div></section></main></div>;

}



