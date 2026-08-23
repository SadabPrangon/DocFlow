import { AlertTriangle, Bell, Camera, Download, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import api from '../lib/api';
import { clearAuth, getUser } from '../lib/auth';

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const blank = 'Add this in Edit';

const DIAL_CODES = ['+880', '+91', '+1', '+44', '+61', '+65', '+971', '+966'];
const splitPhone = (phone) => {
  const value = String(phone || '').trim();
  const code = DIAL_CODES.find((dial) => value.startsWith(dial));
  return code ? { code, number: value.slice(code.length) } : { code: '+880', number: value.replace(/^\+/, '') };
};

// Resized and re-encoded in the browser, so a 4MB camera photo becomes a ~10KB
// square that fits inside the API's 100kb JSON body limit.
const AVATAR_PX = 192;
const toAvatar = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('That file could not be read.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('That file is not an image.'));
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_PX; canvas.height = AVATAR_PX;
      canvas.getContext('2d').drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// Sessions store the raw user agent. Shown as-is it is a 100-character wall of text,
// so it is reduced to the two things a patient needs to recognise the device by.
const deviceLabel = (agent) => {
  const value = String(agent || '');
  const browser = /Edg\//.test(value) ? 'Edge'
    : /OPR\//.test(value) ? 'Opera'
      : /Chrome\//.test(value) ? 'Chrome'
        : /Firefox\//.test(value) ? 'Firefox'
          : /Safari\//.test(value) ? 'Safari' : '';
  const os = /Windows/.test(value) ? 'Windows'
    : /Android/.test(value) ? 'Android'
      : /iPhone|iPad|iOS/.test(value) ? 'iOS'
        : /Mac OS X/.test(value) ? 'macOS'
          : /Linux/.test(value) ? 'Linux' : '';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || (value ? `${value.slice(0, 36)}...` : 'Unknown device');
};

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [sessions, setSessions] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [prefs, setPrefs] = useState(user?.notificationPreferences || { emailReminders: true, smsReminders: false, reminderHoursBefore: 24 });
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  const say = (text, tone = 'ok') => setNote({ text, tone });
  const fail = (error, fallback) => say(error.response?.data?.message || fallback, 'error');
  const store = (next) => {
    setUser(next);
    localStorage.setItem('user', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('docflow-user'));
  };

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      store(data.user);
      if (data.user.notificationPreferences) setPrefs(data.user.notificationPreferences);
    }).catch(() => {});
    api.get('/auth/sessions').then(({ data }) => setSessions(data.sessions || [])).catch(() => {});
  }, []);

  const startEdit = () => {
    const phone = splitPhone(user?.phone);
    setForm({
      name: user?.name || '', designation: user?.designation || '', dialCode: phone.code, phoneNumber: phone.number,
      age: user?.age || '', gender: user?.gender || '', address: user?.address || '', avatar: user?.avatar || '',
    });
    setEditing(true);
    setNote(null);
  };

  const pickAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) return say('Choose an image file.', 'error');
    try {
      const avatar = await toAvatar(file);
      if (avatar.length > 80000) return say('That picture is too detailed to store. Try a simpler one.', 'error');
      setForm((current) => ({ ...current, avatar }));
    } catch (error) { say(error.message, 'error'); }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const digits = String(form.phoneNumber || '').replace(/\D/g, '');
    try {
      // The server rejects an email change here on purpose, so the current one is sent back.
      const { data } = await api.put('/users/me', {
        name: form.name, designation: form.designation, age: form.age, gender: form.gender,
        address: form.address, avatar: form.avatar,
        phone: digits ? `${form.dialCode}${digits}` : '',
        email: user.email,
      });
      store(data.user);
      setEditing(false);
      say(data.message);
    } catch (error) { fail(error, 'Unable to update your profile.'); }
  };

  const savePrefs = async () => {
    try {
      const { data } = await api.put('/users/me/notifications', prefs);
      setPrefs(data.notificationPreferences);
      store({ ...user, notificationPreferences: data.notificationPreferences });
      say(data.message);
    } catch (error) { fail(error, 'Unable to save preferences.'); }
  };

  const enableMfa = async () => {
    try { const { data } = await api.post('/auth/mfa/enable'); setChallenge(data.challengeId); say(data.message); }
    catch (error) { fail(error, 'Unable to start multi-factor setup.'); }
  };
  const verifyMfa = async () => {
    try { const { data } = await api.post('/auth/mfa/verify', { challengeId: challenge, otp }); store(data.user); setChallenge(null); setOtp(''); say(data.message); }
    catch (error) { fail(error, 'Unable to verify the security code.'); }
  };
  const disableMfa = async () => {
    try { const { data } = await api.post('/auth/mfa/disable', { password }); store(data.user); setPassword(''); say(data.message); }
    catch (error) { fail(error, 'Unable to disable multi-factor authentication.'); }
  };

  const revoke = async (id) => {
    await api.delete(`/auth/sessions/${id}`).catch(() => {});
    setSessions((items) => items.filter((item) => item.id !== id));
    say('Session revoked.');
  };
  const logoutEverywhere = async () => {
    await api.post('/auth/logout-all').catch(() => {});
    clearAuth();
    navigate('/login');
  };

  const exportData = async () => {
    try {
      const { data } = await api.get('/users/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'docflow-my-data.json'; link.click();
      URL.revokeObjectURL(url);
      say('Your data was downloaded.');
    } catch (error) { fail(error, 'Unable to export your data.'); }
  };

  const deleteAccount = async () => {
    try {
      await api.delete('/users/me', { data: { password } });
      clearAuth();
      navigate('/login');
    } catch (error) { fail(error, 'Unable to delete the account.'); }
  };

  const tabs = [['profile', 'Profile'], ...(user?.role === 'patient' ? [['notifications', 'Notifications']] : []), ['security', 'Security']];
  const designation = user?.designation || (user?.role === 'doctor' ? user?.specialty : '');

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Settings"/>
    <main className="set-shell">
      <nav className="set-tabs" aria-label="Settings sections">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => { setTab(key); setNote(null); }} className={`set-tab ${tab === key ? 'active' : ''}`}>{label}</button>)}
      </nav>

      {note && <p className={`set-note ${note.tone}`}>{note.text}</p>}

      {tab === 'profile' && <>
        <section className="set-card">
          <form onSubmit={saveProfile}>
            <div className="set-identity">
              {editing ? <button type="button" className="set-avatar edit" onClick={() => fileRef.current?.click()} title="Change profile picture">
                {form.avatar ? <img src={form.avatar} alt=""/> : initials(user?.name)}
                <span className="set-avatar-badge"><Camera size={12}/></span>
              </button> : <span className="set-avatar">{user?.avatar ? <img src={user.avatar} alt=""/> : initials(user?.name)}</span>}
              <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} hidden/>
              <span className="set-identity-copy">
                <b>{user?.name}</b>
                <small>{user?.email}</small>
              </span>
              {editing ? <span className="set-inline">
                <button type="button" onClick={() => setEditing(false)} className="set-button">Cancel</button>
                <button type="submit" className="set-button primary">Update</button>
              </span> : <button type="button" onClick={startEdit} className="set-button">Edit</button>}
            </div>

            {editing ? <div className="set-form">
              <label><span>Full Name <b className="set-required">*</b></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required/></label>
              <span className="set-readonly"><small>Email Address</small><b>{user?.email}</b><i>Change it from Security, with a verification code.</i></span>
              <label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder={user?.role === 'doctor' ? 'e.g. Consultant Cardiologist' : 'e.g. Software Engineer'}/></label>
              <label>Phone number<span className="set-phone">
                <select value={form.dialCode} onChange={(e) => setForm({ ...form, dialCode: e.target.value })}>{DIAL_CODES.map((code) => <option key={code}>{code}</option>)}</select>
                <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="1760533424" inputMode="numeric"/>
              </span></label>
              <label>Age<input type="number" min="1" max="120" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })}/></label>
              <label>Gender<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Not specified</option><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label className="set-form-wide">Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}/></label>
            </div> : <div className="set-grid">
              <span><small>Designation</small>{designation ? <b>{designation}</b> : <i>{blank}</i>}</span>
              <span><small>Phone number</small>{user?.phone ? <b>{user.phone}</b> : <i>{blank}</i>}</span>
              <span><small>Age</small>{user?.age ? <b>{user.age}</b> : <i>{blank}</i>}</span>
              <span><small>Gender</small>{user?.gender ? <b>{user.gender}</b> : <i>{blank}</i>}</span>
              <span className="set-grid-wide"><small>Address</small>{user?.address ? <b>{user.address}</b> : <i>{blank}</i>}</span>
            </div>}
          </form>
        </section>

        <section className="set-card danger">
          <h2 className="set-card-title danger"><AlertTriangle size={15}/>Danger zone</h2>
          <p className="set-card-copy">Permanently close <b>{user?.name}</b>&apos;s account. Sign-in is removed and your contact details are erased. Appointments and consultation notes are kept, because clinics must retain healthcare records.</p>
          <div className="set-row">
            <span className="set-row-copy"><b>Export your data</b><small>Download your profile and appointment history as JSON.</small></span>
            <button type="button" onClick={exportData} className="set-button"><Download size={14}/>Export</button>
          </div>
          {confirming ? <div className="set-row">
            <span className="set-row-copy"><b>Confirm with your password</b><small>This cannot be undone.</small></span>
            <span className="set-inline">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password"/>
              <button type="button" onClick={() => { setConfirming(false); setPassword(''); }} className="set-button">Cancel</button>
              <button type="button" onClick={deleteAccount} disabled={!password} className="set-button danger">Delete for good</button>
            </span>
          </div> : <button type="button" onClick={() => setConfirming(true)} className="set-button danger"><Trash2 size={14}/>Delete account</button>}
        </section>
      </>}

      {tab === 'notifications' && <section className="set-card">
        <h2 className="set-card-title"><Bell size={15}/>Appointment reminders</h2>
        <p className="set-card-copy">SMS needs a phone number in international format, for example +8801XXXXXXXXX.</p>
        <div className="set-row">
          <span className="set-row-copy"><b>Email reminders</b><small>Sent to {user?.email}.</small></span>
          <label className="set-switch"><input type="checkbox" checked={prefs.emailReminders} onChange={(e) => setPrefs({ ...prefs, emailReminders: e.target.checked })}/><span/></label>
        </div>
        <div className="set-row">
          <span className="set-row-copy"><b>SMS reminders</b><small>{user?.phone ? `Sent to ${user.phone}.` : 'Add a phone number on the Profile tab first.'}</small></span>
          <label className="set-switch"><input type="checkbox" checked={prefs.smsReminders} onChange={(e) => setPrefs({ ...prefs, smsReminders: e.target.checked })}/><span/></label>
        </div>
        <div className="set-row">
          <span className="set-row-copy"><b>How far ahead</b><small>Hours before the appointment, between 1 and 168.</small></span>
          <input type="number" min="1" max="168" className="set-number" value={prefs.reminderHoursBefore} onChange={(e) => setPrefs({ ...prefs, reminderHoursBefore: Number(e.target.value) })}/>
        </div>
        <button type="button" onClick={savePrefs} className="set-button primary">Save preferences</button>
      </section>}

      {tab === 'security' && <>
        <section className="set-card">
          <h2 className="set-card-title"><ShieldCheck size={15}/>Security</h2>
          <div className="set-row">
            <span className="set-row-copy"><b>Password</b><small>Reset it by email if you have forgotten it, or want a new one.</small></span>
            <button type="button" onClick={() => navigate('/forgot-password')} className="set-button">Reset password</button>
          </div>
          <div className="set-row">
            <span className="set-row-copy">
              <b>Two-factor authentication <span className={`set-pill ${user?.mfaEnabled ? 'on' : ''}`}>{user?.mfaEnabled ? 'Enabled' : 'Disabled'}</span></b>
              <small>Require a code sent to your email when you sign in.</small>
            </span>
            {user?.mfaEnabled
              ? <span className="set-inline"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password"/><button type="button" onClick={disableMfa} disabled={!password} className="set-button">Disable</button></span>
              : challenge
                ? <span className="set-inline"><input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" inputMode="numeric"/><button type="button" onClick={verifyMfa} disabled={otp.length !== 6} className="set-button primary">Verify</button></span>
                : <button type="button" onClick={enableMfa} className="set-button primary">Enable</button>}
          </div>
        </section>

        <section className="set-card">
          <h2 className="set-card-title"><LogOut size={15}/>Active sessions</h2>
          <p className="set-card-copy">Devices currently signed in to your account.</p>
          {sessions.map((session) => <div key={session.id} className="set-row">
            <span className="set-row-copy"><b>{deviceLabel(session.device)} {session.current && <span className="set-pill on">This device</span>}</b><small title={session.device}>{session.ip || 'no address'} · last used {new Date(session.lastUsedAt).toLocaleString()}</small></span>
            {!session.current && <button type="button" onClick={() => revoke(session.id)} className="set-button">Revoke</button>}
          </div>)}
          {!sessions.length && <p className="set-card-copy">No other sessions.</p>}
          <button type="button" onClick={logoutEverywhere} className="set-button danger">Log out from all devices</button>
        </section>
      </>}

    </main>
  </div>;
}
