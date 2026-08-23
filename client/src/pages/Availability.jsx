import { useEffect, useState } from 'react';
import ConsultationLength from '../components/ConsultationLength';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const base = { timezone: 'Asia/Dhaka', slotDuration: 30, weekly: days.map((_, day) => ({ day, enabled: day > 0 && day < 6, start: '09:00', end: '17:00' })), unavailableDates: [], overrides: [] };
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// A doctor books leave as whole days, so a closed override is all it takes.
const MAX_LEAVE_DAYS = 90;
const eachDate = (from, to) => {
  const dates = [];
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
};

export default function Availability() {
  const [schedule, setSchedule] = useState(base); const [leave, setLeave] = useState({ from: '', to: '' }); const [leaveError, setLeaveError] = useState(''); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  // A doctor who has never saved a schedule still needs the seven day rows to fill in.
  useEffect(() => { api.get('/auth/me').then(({ data }) => { const saved = data.user.availability; setSchedule({ ...base, ...saved, weekly: saved?.weekly?.length ? saved.weekly : base.weekly, overrides: saved?.overrides || [] }); }); }, []);
  const updateDay = (day, changes) => setSchedule({ ...schedule, weekly: schedule.weekly.map((item) => item.day === day ? { ...item, ...changes } : item) });
  const applyForLeave = () => {
    const to = leave.to || leave.from;
    if (to < leave.from) return setLeaveError('The last day cannot come before the first.');
    const dates = eachDate(leave.from, to);
    if (dates.length > MAX_LEAVE_DAYS) return setLeaveError(`Book at most ${MAX_LEAVE_DAYS} days at a time.`);
    const closed = dates.map((date) => ({ date, enabled: false, start: '09:00', end: '17:00', breaks: [] }));
    const kept = schedule.overrides.filter((item) => !dates.includes(item.date));
    setSchedule({ ...schedule, overrides: [...kept, ...closed].sort((a, b) => a.date.localeCompare(b.date)) });
    setLeave({ from: '', to: '' }); setLeaveError('');
  };
  // The button says it saved; a banner for that would outlive the moment.
  const save = async () => {
    try {
      const { data } = await api.put('/users/me/availability', schedule);
      setSchedule(data.availability || schedule); setError(''); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (problem) { setSaved(false); setError(problem.response?.data?.message || 'Unable to save availability.'); }
  };
  // Only closed days are leave; any other override is historical data from the
  // schedule builder this card replaced, and is left alone.
  const closedDates = schedule.overrides.filter((item) => item.enabled === false);
  // Either card saves the whole schedule, so both headers carry the same control.
  const saveControl = <div className="sched-save">{error && <span className="cons-hint bad">{error}</span>}<button type="button" onClick={save} className="sched-button">{saved ? 'Saved' : 'Save schedule'}</button></div>;
  return <div className="min-h-screen bg-slate-100"><PageHeader title="Schedule & Availability" backTo="/doctor-dashboard"/><main className="mx-auto max-w-5xl px-6 py-10"><section className="rounded-3xl bg-white p-8 shadow"><div className="sched-head"><h1 className="text-3xl font-bold">Regular weekly hours</h1>{saveControl}</div><ConsultationLength value={schedule.slotDuration} weekly={schedule.weekly} onChange={(minutes) => setSchedule({ ...schedule, slotDuration: minutes })}/><div className="mt-5 grid gap-3">{schedule.weekly.map((item) => <div key={item.day} className="grid items-center gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[130px_1fr_1fr]"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={item.enabled} onChange={(e) => updateDay(item.day, { enabled: e.target.checked })}/>{days[item.day]}</label><input disabled={!item.enabled} type="time" value={item.start} onChange={(e) => updateDay(item.day, { start: e.target.value })} className="rounded-lg border px-3 py-2"/><input disabled={!item.enabled} type="time" value={item.end} onChange={(e) => updateDay(item.day, { end: e.target.value })} className="rounded-lg border px-3 py-2"/></div>)}</div></section><section className="mt-7 rounded-3xl bg-white p-8 shadow"><div className="sched-head"><h2 className="text-2xl font-bold">Leave and holidays</h2>{saveControl}</div><p className="mt-2 text-sm text-slate-500">Close a date, or a run of dates, so nobody can book you then. Save the schedule to apply it.</p><div className="leave-form"><label>From<input type="date" min={localDate()} value={leave.from} onChange={(event) => setLeave({ from: event.target.value, to: leave.to && leave.to >= event.target.value ? leave.to : event.target.value })}/></label><label>To<input type="date" min={leave.from || localDate()} value={leave.to} onChange={(event) => setLeave({ ...leave, to: event.target.value })}/></label><button type="button" className="leave-button" disabled={!leave.from} onClick={applyForLeave}>Apply for leave</button>{leaveError && <span className="cons-hint bad">{leaveError}</span>}</div><div className="mt-5 space-y-2">{closedDates.length ? closedDates.map((item) => <div key={item.date} className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><span><b>{item.date}</b> · Closed</span><button type="button" onClick={() => setSchedule({ ...schedule, overrides: schedule.overrides.filter((value) => value.date !== item.date) })} className="font-semibold text-red-600">Remove</button></div>) : <p className="tbar-empty">No leave booked.</p>}</div></section></main></div>;
}
