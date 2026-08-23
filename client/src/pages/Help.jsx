import { Bot, CalendarDays, LifeBuoy, Radio, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { getUser } from '../lib/auth';

const shared = [
  ['/settings', SlidersHorizontal, 'Change your details', 'Name, phone, profile picture and notification preferences all live in Settings.'],
  ['/settings', ShieldCheck, 'Trouble signing in', 'Reset your password by email, or turn on two-factor authentication, from the Security tab.'],
];
const byRole = {
  patient: [
    ['/doctors', CalendarDays, 'Booking an appointment', 'Pick a doctor, choose an open slot, and reception approves it before it is confirmed.'],
    ['/live-queue', Radio, 'Following the queue', 'Once an appointment is approved you get a queue number and can watch who is being seen.'],
    ['/ai-recommendation', Bot, 'Not sure who to see', 'Describe your symptoms to the care assistant and it will suggest a doctor and a time.'],
  ],
  doctor: [['/availability', CalendarDays, 'Setting your hours', 'Your weekly schedule, breaks and days off decide which slots patients can book.']],
  admin: [['/admin-dashboard', CalendarDays, 'Managing staff', 'Doctor and receptionist accounts are created and deactivated from the dashboard.']],
  receptionist: [['/operations', CalendarDays, 'Running the queue', 'Approve appointments, assign queue numbers, and pause or close a queue from Operations.']],
};

export default function Help() {
  const user = getUser();
  const topics = [...(byRole[user?.role] || []), ...shared];

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Help & Support"/>
    <main className="set-shell">
      <section className="set-card">
        <h2 className="set-card-title"><LifeBuoy size={15}/>Help &amp; Support</h2>
        <p className="set-card-copy">Common questions for your role. Anything a screen cannot answer, your clinic reception can.</p>
        {topics.map(([to, Icon, title, description]) => <div key={title} className="set-row">
          <span className="set-row-copy"><b>{title}</b><small>{description}</small></span>
          <Link to={to} className="set-button"><Icon size={14}/>Open</Link>
        </div>)}
      </section>

      <section className="set-card">
        <h2 className="set-card-title">Something is wrong with the app</h2>
        <p className="set-card-copy">
          Report it to whoever runs this DocFlow deployment, with what you were doing and the time it happened.
          If it involves a patient record, do not include the details in the message itself.
        </p>
      </section>
    </main>
  </div>;
}
