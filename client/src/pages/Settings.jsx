import { Bell, CalendarDays, ChevronRight, CreditCard, FileHeart, LockKeyhole, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { getUser } from '../lib/auth';

// Settings that already live on their own pages, grouped by who can reach them.
const shared = [['/security', ShieldCheck, 'Account security', 'Password, multi-factor authentication, active sessions and data export']];
const byRole = {
  patient: [
    ['/profile', UserRound, 'Profile', 'Name, contact details, date of birth and address'],
    ['/notification-settings', Bell, 'Notification preferences', 'Email and SMS reminders, and how far ahead they arrive'],
    ['/payments', CreditCard, 'Payments and calendar', 'Payment history and calendar downloads'],
  ],
  doctor: [['/availability', CalendarDays, 'Availability', 'Weekly schedule, breaks, days off and slot length']],
  admin: [
    ['/audit', LockKeyhole, 'Audit log', 'Security events, actor history and CSV export'],
    ['/reports', FileHeart, 'Reports', 'Appointment, doctor and revenue reporting'],
  ],
  receptionist: [['/operations', CalendarDays, 'Operations', 'Queue control, pauses and closure messages']],
};

export default function Settings() {
  const user = getUser();
  const links = [...(byRole[user?.role] || []), ...shared];
  const [dark, setDark] = useState(() => localStorage.getItem('docflow-theme') === 'dark');

  // The header owns the theme toggle, so tell it rather than let the two drift apart.
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', dark);
    localStorage.setItem('docflow-theme', dark ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('docflow-theme', { detail: dark }));
  }, [dark]);

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Settings"/>
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="eyebrow">{user?.role || 'Account'}</p>
      <h1 className="page-title mt-2 text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-slate-500">Everything you can change about your DocFlow account, in one place.</p>

      <section className="app-card mt-8 rounded-3xl p-6">
        <h2 className="font-bold text-slate-900">Appearance</h2>
        <p className="mt-1 text-slate-500">Choose how DocFlow looks on this device.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setDark(false)} className={`settings-theme ${dark ? '' : 'active'}`}><Sun size={15}/>Light</button>
          <button type="button" onClick={() => setDark(true)} className={`settings-theme ${dark ? 'active' : ''}`}><Moon size={15}/>Dark</button>
        </div>
      </section>

      <section className="app-card mt-5 rounded-3xl p-2">
        {links.map(([to, Icon, title, description]) => <Link key={to} to={to} className="settings-row">
          <span className="settings-row-mark"><Icon size={16}/></span>
          <span className="settings-row-copy">
            <b>{title}</b>
            <small>{description}</small>
          </span>
          <ChevronRight size={15} className="settings-row-arrow"/>
        </Link>)}
      </section>
    </main>
  </div>;
}
