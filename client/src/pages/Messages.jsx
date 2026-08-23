import { MessageSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';
import { getUser } from '../lib/auth';

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const clock = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Today';
  if (same(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
};
// Consecutive lines from one person collapse into a block, as they do in Slack.
const startsBlock = (message, previous) => !previous
  || previous.sender?._id !== message.sender?._id
  || new Date(message.createdAt) - new Date(previous.createdAt) > 5 * 60 * 1000
  || new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString();

export default function Messages() {
  const { appointmentId } = useParams();
  const user = getUser();
  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(appointmentId || '');
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  const counterpart = (appointment) => (user?.role === 'doctor' ? appointment.patient?.name : appointment.doctorName) || 'DocFlow';
  const current = appointments.find((item) => item._id === selected);

  useEffect(() => {
    api.get(user?.role === 'doctor' ? '/appointments/doctor/mine' : '/appointments/mine')
      .then(({ data }) => setAppointments(data.appointments || []))
      .catch(() => {});
  }, [user?.role]);

  // Polled rather than pushed: the API has no socket, and a thread that only
  // updates when you send something does not read as a conversation.
  useEffect(() => {
    if (!selected) return undefined;
    let live = true;
    const load = () => api.get(`/clinical/appointments/${selected}/messages`)
      .then(({ data }) => { if (live) setMessages(data.messages || []); })
      .catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => { live = false; clearInterval(timer); };
  }, [selected]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [messages, selected]);

  const send = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/clinical/appointments/${selected}/messages`, { body: text });
      setBody('');
      if (data.message) setMessages((items) => [...items, { ...data.message, sender: { _id: user?.id, name: user?.name, role: user?.role } }]);
    } catch { /* the poll above will reconcile */ } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); }
  };

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Secure Messages"/>
    <main className="msg-shell">
      <aside className="msg-rail">
        <p className="msg-rail-head">Conversations</p>
        <div className="msg-rail-list">
          {appointments.map((appointment) => <button
            key={appointment._id}
            type="button"
            onClick={() => setSelected(appointment._id)}
            className={`msg-item ${selected === appointment._id ? 'active' : ''}`}
          >
            <span className="msg-avatar">{initials(counterpart(appointment))}</span>
            <span className="msg-item-copy">
              <b>{counterpart(appointment)}</b>
              <small>{appointment.appointmentDate} · {appointment.specialty || appointment.status}</small>
            </span>
          </button>)}
          {!appointments.length && <p className="msg-empty-rail">No appointments to message about yet.</p>}
        </div>
      </aside>

      <section className="msg-main">
        {current ? <>
          <header className="msg-head">
            <span className="msg-avatar">{initials(counterpart(current))}</span>
            <span className="msg-head-copy">
              <b>{counterpart(current)}</b>
              <small>{current.specialty || 'Appointment'} · {current.appointmentDate} at {current.appointmentTime}</small>
            </span>
          </header>

          <div className="msg-stream" ref={streamRef}>
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay = !previous || new Date(message.createdAt).toDateString() !== new Date(previous.createdAt).toDateString();
              const block = startsBlock(message, previous);
              return <div key={message._id || index}>
                {newDay && <p className="msg-day"><span>{dayLabel(message.createdAt)}</span></p>}
                <div className={`msg-row ${block ? '' : 'grouped'}`}>
                  {block ? <span className="msg-avatar">{initials(message.sender?.name)}</span> : <span className="msg-row-time">{clock(message.createdAt)}</span>}
                  <span className="msg-row-copy">
                    {block && <span className="msg-meta"><b>{message.sender?.name}</b><small>{clock(message.createdAt)}</small></span>}
                    <p className="msg-body">{message.body}</p>
                  </span>
                </div>
              </div>;
            })}
            {!messages.length && <p className="msg-empty">No messages yet. Say hello.</p>}
          </div>

          <form onSubmit={send} className="msg-composer-wrap">
            <div className="msg-composer">
              <textarea
                ref={inputRef}
                rows="1"
                value={body}
                maxLength={3000}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${counterpart(current)}`}
                aria-label="Write a secure message"
              />
              <button type="submit" disabled={!body.trim() || sending} className="msg-send" aria-label="Send message"><Send size={15}/></button>
            </div>
            <p className="msg-hint">Enter to send, Shift+Enter for a new line. Messages are visible to you and the other party only.</p>
          </form>
        </> : <div className="msg-blank">
          <span className="msg-blank-mark"><MessageSquare size={20}/></span>
          <b>Choose a conversation</b>
          <small>Pick an appointment on the left to read and reply to its messages.</small>
        </div>}
      </section>
    </main>
  </div>;
}
