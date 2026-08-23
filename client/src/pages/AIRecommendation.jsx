import { AlertTriangle, ArrowUp, Bot, CalendarDays, Clock3, MapPin, MessageSquarePlus, Stethoscope, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';

const starters = [
  'I have had chest pain and it gets worse when I walk.',
  'There is a red rash spreading on my skin.',
  'Constant headache and I feel dizzy when I stand up.',
  'My baby has had a fever since last night.',
];
export default function AIRecommendation() {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const location = useLocation();

  const loadList = () => api.get('/ai/conversations')
    .then(({ data }) => setConversations(data.conversations || []))
    .catch(() => {});

  const openConversation = async (id) => {
    try {
      const { data } = await api.get(`/ai/conversations/${id}`);
      setMessages(data.conversation.messages || []);
      setConversationId(id);
    } catch { /* the chat was deleted elsewhere; the rail refreshes below */ }
  };

  // Arriving here always starts a fresh chat, including when the sidebar entry is
  // clicked while already on the page: React Router stamps a new key per navigation,
  // so keying off it catches that case, which a mount-only effect would miss.
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setDraft('');
    loadList();
  }, [location.key]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [draft]);

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setDraft('');
    inputRef.current?.focus();
  };

  const removeChat = async (event, id) => {
    event.stopPropagation();
    await api.delete(`/ai/conversations/${id}`).catch(() => {});
    if (id === conversationId) newChat();
    loadList();
  };

  const send = async (text) => {
    const question = text.trim();
    if (!question || thinking) return;
    setMessages((items) => [...items, { role: 'user', text: question }]);
    setDraft('');
    setThinking(true);
    try {
      // A local model on CPU can take well over the 15s default in lib/api.js.
      const { data } = await api.post('/ai/recommend', { message: question, conversationId }, { timeout: 120000 });
      setMessages((items) => [...items, {
        role: 'assistant',
        text: data.reply,
        recommendations: data.recommendations || [],
        urgent: Boolean(data.urgent),
      }]);
      if (data.conversationId) setConversationId(data.conversationId);
      loadList();
    } catch (error) {
      setMessages((items) => [...items, {
        role: 'assistant',
        text: error.response?.data?.message || 'The care assistant is unavailable right now. Please try again.',
        recommendations: [],
        failed: true,
      }]);
    } finally {
      setThinking(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(draft); }
  };

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Care Assistant" backTo="/dashboard"/>
    <main className="chat-shell">
      <aside className="chat-history">
        <button type="button" onClick={newChat} className="chat-new"><MessageSquarePlus size={15}/>New chat</button>
        <p className="chat-history-label">Recent</p>
        <div className="chat-history-list">
          {conversations.length ? conversations.map((item) => <button
            key={item.id}
            type="button"
            onClick={() => openConversation(item.id)}
            className={`chat-history-item ${item.id === conversationId ? 'active' : ''}`}
          >
            <span className="chat-history-title">{item.title}</span>
            <span className="chat-history-delete" role="button" tabIndex={0} aria-label="Delete chat" onClick={(event) => removeChat(event, item.id)}><Trash2 size={13}/></span>
          </button>) : <p className="chat-history-empty">No saved chats yet.</p>}
        </div>
      </aside>

      <div className="chat-main">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-column">
          {!messages.length && !thinking && <div className="chat-intro">
            <span className="chat-intro-mark"><Bot size={22}/></span>
            <h1 className="chat-intro-title">Find a suitable doctor</h1>
            <p className="chat-intro-copy">Describe your symptoms in your own words. I will suggest a doctor from our clinic and a time you can book.</p>
            <div className="chat-starters">
              {starters.map((item) => <button key={item} type="button" onClick={() => send(item)} className="chat-starter">{item}</button>)}
            </div>
          </div>}

          {messages.map((message, index) => <div key={index} className={`chat-turn ${message.role}`}>
            {message.role === 'assistant' && <span className="chat-avatar assistant"><Bot size={15}/></span>}
            <div className="chat-bubble">
              {message.urgent && <p className="chat-urgent"><AlertTriangle size={14}/>This may need urgent care. If it is severe or worsening, contact emergency services now.</p>}
              <p className="chat-text">{message.text}</p>
              {(message.recommendations || []).map((doctor) => <div key={doctor.doctorId} className="doc-card">
                <div className="doc-card-head">
                  <span className="doc-card-mark"><Stethoscope size={15}/></span>
                  <span className="doc-card-id">
                    <b>{doctor.name}</b>
                    <small>{doctor.specialty}</small>
                  </span>
                  <span className="doc-card-fee">৳{doctor.fee}</span>
                </div>
                {doctor.why && <p className="doc-card-why">{doctor.why}</p>}
                <p className="doc-card-meta"><CalendarDays size={13}/>{doctor.day}, {doctor.date}<Clock3 size={13}/>{doctor.time}<MapPin size={13}/>{doctor.location}</p>
                <Link to={`/book-appointment/${doctor.doctorId}`} className="doc-card-book">Book this slot</Link>
              </div>)}
            </div>
            {message.role === 'user' && <span className="chat-avatar user"><UserRound size={15}/></span>}
          </div>)}

          {thinking && <div className="chat-turn assistant">
            <span className="chat-avatar assistant"><Bot size={15}/></span>
            <div className="chat-bubble"><span className="chat-thinking"><span className="chat-dots"><i/><i/><i/></span>Checking doctors and open slots...</span></div>
          </div>}
          </div>
        </div>

        <div className="chat-composer-wrap">
          <div className="chat-column">
          <div className="chat-composer">
            <textarea
              ref={inputRef}
              rows="1"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Describe your symptoms..."
              aria-label="Describe your symptoms"
            />
            <button type="button" onClick={() => send(draft)} disabled={!draft.trim() || thinking} className="chat-send" aria-label="Send message"><ArrowUp size={16}/></button>
          </div>
          <p className="chat-disclaimer">Guidance only, not a medical diagnosis. Always confirm with a doctor.</p>
          </div>
        </div>
      </div>
    </main>
  </div>;
}
