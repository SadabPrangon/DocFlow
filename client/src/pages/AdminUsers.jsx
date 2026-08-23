import { CheckCircle2, Search, UserPlus, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Dropdown from '../components/Dropdown';
import PageHeader from '../components/PageHeader';
import RowMenu from '../components/RowMenu';
import api from '../lib/api';

const empty = { name: '', email: '', password: '', phone: '', role: 'doctor', specialty: '', experience: '', location: '', fee: '' };
const FIELDS = [['name', 'Name'], ['email', 'Email'], ['password', 'Temporary password'], ['phone', 'Phone'], ['specialty', 'Specialty'], ['experience', 'Experience'], ['location', 'Location'], ['fee', 'Fee']];
const DOCTOR_ONLY = ['specialty', 'experience', 'location', 'fee'];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const dialog = useRef(null);
  const [err, setErr] = useState(false);

  // The endpoint filters, so the list stays right however many accounts exist.
  const load = useCallback(() => {
    const params = { limit: 100 };
    if (query.trim()) params.search = query.trim();
    if (role) params.role = role;
    if (active) params.active = active;
    return api.get('/users/admin/users', { params })
      .then((r) => setUsers(r.data.users || []))
      .finally(() => setLoaded(true));
  }, [query, role, active]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (creating && !element.open) element.showModal();
    if (!creating && element.open) element.close();
  }, [creating]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/users/admin/staff', form);
      setErr(false); setMsg(data.message); setForm(empty); setCreating(false); load();
    } catch (error) { setErr(true); setMsg(error.response?.data?.message || 'Unable to create the account.'); }
  };
  const toggle = async (user) => {
    try { const { data } = await api.patch(`/users/admin/staff/${user.id}/toggle`); setErr(false); setMsg(data.message); load(); }
    catch (error) { setErr(true); setMsg(error.response?.data?.message || 'Unable to change that account.'); }
  };

  const counts = useMemo(() => users.reduce((total, user) => ({ ...total, [user.role]: (total[user.role] || 0) + 1 }), {}), [users]);
  const filtering = Boolean(query.trim() || role || active);

  return <div className="min-h-screen bg-slate-100">
    <PageHeader title="Users"/>
    <main className="mx-auto max-w-7xl px-6 py-10">
      {msg && <div className={`rounded-xl p-3 ${err ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{msg}</div>}

      <div className="tbar">
        <span className="tbar-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or phone" aria-label="Search users"/>
        </span>
        <Dropdown
          label="Filter by role"
          value={role}
          onChange={setRole}
          options={[{ value: '', label: 'Everyone' }, { value: 'patient', label: 'Patients' }, { value: 'doctor', label: 'Doctors' }, { value: 'receptionist', label: 'Receptionists' }, { value: 'admin', label: 'Admins' }]}
        />
        <Dropdown
          label="Filter by status"
          value={active}
          onChange={setActive}
          options={[{ value: '', label: 'Active and inactive' }, { value: 'true', label: 'Active only' }, { value: 'false', label: 'Inactive only' }]}
        />
        {filtering && <button type="button" className="tbar-clear" onClick={() => { setQuery(''); setRole(''); setActive(''); }}>Clear</button>}
        <button type="button" className="tbl-act primary" onClick={() => setCreating(true)}><UserPlus size={13}/>New staff account</button>
        <span className="tbar-count">{loaded ? `${users.length} shown` : 'Loading…'}</span>
      </div>

      {/* A native dialog, so Escape, the backdrop and focus behave without being
          reimplemented here. */}
      <dialog ref={dialog} className="modal" onClose={() => setCreating(false)} onClick={(event) => { if (event.target === dialog.current) setCreating(false); }}>
        <form onSubmit={submit} className="modal-body">
          <div className="modal-head">
            <div>
              <p className="cons-label">New doctor or receptionist</p>
              <p className="cons-hint">Set a strong temporary password and pass it on securely. Patients register themselves.</p>
            </div>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setCreating(false)}><X size={16}/></button>
          </div>
        <div className="staff-grid">
          {FIELDS.map(([name, label]) => (form.role === 'receptionist' && DOCTOR_ONLY.includes(name) ? null : <label key={name}>{label}
            <input
              type={name === 'password' ? 'password' : name === 'fee' ? 'number' : 'text'}
              required={['name', 'email', 'password'].includes(name)}
              value={form[name]}
              onChange={(event) => setForm({ ...form, [name]: event.target.value })}
            />
          </label>))}
          <label>Role
            <Dropdown
              label="Role for the new account"
              value={form.role}
              onChange={(value) => setForm({ ...form, role: value })}
              options={[{ value: 'doctor', label: 'Doctor' }, { value: 'receptionist', label: 'Receptionist' }]}
            />
          </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="tbl-act" onClick={() => setCreating(false)}>Cancel</button>
            <button className="tbl-act primary">Create account</button>
          </div>
        </form>
      </dialog>

      {!users.length && loaded && <p className="tbar-empty">No account matches that.</p>}

      {Boolean(users.length) && <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col" className="tbl-end"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isActive = user.isActive !== false;
              const staff = ['doctor', 'receptionist'].includes(user.role);
              return <tr key={user.id}>
                <td>
                  <div className="tbl-name">{user.name}</div>
                  <div className="tbl-sub">{user.phone || 'No phone'}</div>
                </td>
                <td>{user.email}</td>
                <td className="capitalize">{user.role}</td>
                <td>
                  <span className={`pill ${isActive ? 'ok' : 'bad'}`}>{isActive ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}{isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="tbl-end">
                  {/* Only staff accounts are the admin's to switch off; a patient
                      closes their own account from Settings. */}
                  <RowMenu label={`Actions for ${user.name}`} items={staff ? [{
                    label: isActive ? 'Deactivate' : 'Activate',
                    icon: isActive ? <XCircle size={14}/> : <UserRound size={14}/>,
                    tone: isActive ? 'danger' : '',
                    onClick: () => toggle(user),
                  }] : []}/>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}

      {loaded && Boolean(users.length) && <p className="tbar-count staff-tally">
        {['patient', 'doctor', 'receptionist', 'admin'].filter((key) => counts[key]).map((key) => `${counts[key]} ${key}${counts[key] > 1 ? 's' : ''}`).join(' · ')}
      </p>}
    </main>
  </div>;
}
