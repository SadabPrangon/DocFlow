import { ArrowLeft, Bell, Bot, CalendarDays, ChevronDown, ChevronRight, FileHeart, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageSquare, Moon, PanelLeftClose, PanelLeftOpen, LifeBuoy, Radio, SlidersHorizontal, Stethoscope, Sun, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, dashboardFor, getUser } from '../lib/auth';
import api from '../lib/api';

const patientNav = [
  ['/dashboard', LayoutDashboard, 'Dashboard'],
  ['/doctors', Stethoscope, 'Doctors'],
  ['/my-appointments', CalendarDays, 'Appointments'],
  ['/live-queue', Radio, 'Live Queue'],
  ['/medical-records', FileHeart, 'Medical records'],
  ['/messages', MessageSquare, 'Messages'],
  ['/ai-recommendation', Bot, 'Care assistant'],
];
const doctorNav = [['/doctor-dashboard', LayoutDashboard, 'Dashboard'], ['/clinical-workspace', FileHeart, 'Clinical workspace'], ['/messages', MessageSquare, 'Messages'], ['/availability', CalendarDays, 'Availability']];
const adminNav = [['/admin-dashboard', LayoutDashboard, 'Dashboard'], ['/reports', FileHeart, 'Reports'], ['/operations', CalendarDays, 'Operations']];
const receptionistNav = [['/receptionist-dashboard', LayoutDashboard, 'Dashboard'], ['/operations', CalendarDays, 'Operations']];

export default function PageHeader({ title, backTo }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('docflow-sidebar-collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [dark, setDark] = useState(() => localStorage.getItem('docflow-theme') === 'dark');
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getUser());
  const home = dashboardFor(user?.role);
  const nav = user?.role === 'patient' ? patientNav : user?.role === 'doctor' ? doctorNav : user?.role === 'admin' ? adminNav : user?.role === 'receptionist' ? receptionistNav : [[home, LayoutDashboard, 'Dashboard']];
  const active = to => location.pathname === to || (to !== home && location.pathname.startsWith(`${to}/`));
  const logout = async () => { await api.post('/auth/logout').catch(() => {}); clearAuth(); navigate('/login'); };
  const toggleSidebar = () => setCollapsed(value => {
    localStorage.setItem('docflow-sidebar-collapsed', String(!value));
    return !value;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', dark);
    localStorage.setItem('docflow-theme', dark ? 'dark' : 'light');
  }, [dark]);
  // Saving on the settings page writes to localStorage, which this already-mounted
  // header would otherwise not notice until a navigation remounted it.
  useEffect(() => {
    const refresh = () => setUser(getUser());
    window.addEventListener('docflow-user', refresh);
    return () => window.removeEventListener('docflow-user', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => api.get('/notifications?limit=8').then(({ data }) => { if (active) { setNotifications(data.notifications); setUnread(data.unread); } }).catch(() => {});
    load(); const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const readNotification = async (notification) => {
    if (!notification.read) { await api.patch(`/notifications/${notification._id}/read`).catch(() => {}); setUnread(value => Math.max(value - 1, 0)); }
    setNotificationOpen(false);
  };
  const readAll = async () => { await api.patch('/notifications/read-all'); setNotifications(items => items.map(item => ({ ...item, read: true }))); setUnread(0); };

  return <><aside className={`saas-header ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
    <div className="sidebar-desktop">
      <div className="sidebar-brand-row"><Link to={home} className="sidebar-brand" title={collapsed ? 'DocFlow' : undefined}><span className="brand-mark"><Stethoscope size={20}/></span><span className="sidebar-copy text-lg font-extrabold tracking-tight text-slate-900">DocFlow</span></Link><button onClick={toggleSidebar} className="sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
      <nav className="sidebar-nav" aria-label="Main navigation">{nav.map(([to, Icon, label]) => <Link key={to} to={to} title={collapsed ? label : undefined} className={`nav-pill ${active(to) ? 'active' : ''}`}><Icon size={18}/><span className="sidebar-copy">{label}</span>{active(to) && <ChevronRight className="sidebar-copy ml-auto" size={15}/>}</Link>)}</nav>
      <div className="sidebar-footer">
        <Link to="/help" title={collapsed ? 'Help & Support' : undefined} className={`nav-pill ${active('/help') ? 'active' : ''}`}><LifeBuoy size={18}/><span className="sidebar-copy">Help & Support</span>{active('/help') && <ChevronRight className="sidebar-copy ml-auto" size={15}/>}</Link>
        <Link to="/settings" title={collapsed ? 'Settings' : undefined} className={`nav-pill ${active('/settings') ? 'active' : ''}`}><SlidersHorizontal size={18}/><span className="sidebar-copy">Settings</span>{active('/settings') && <ChevronRight className="sidebar-copy ml-auto" size={15}/>}</Link>
      </div>
    </div>
    <div className="sidebar-mobile">
      <div className="flex items-center gap-3">{backTo && <Link to={backTo} aria-label="Go back" className="mobile-icon-button"><ArrowLeft size={18}/></Link>}<Link to={home} className="flex items-center gap-2.5"><span className="brand-mark"><Stethoscope size={18}/></span><span className="font-extrabold tracking-tight">DocFlow</span></Link></div>
      <button aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen(value => !value)} className="mobile-icon-button">{mobileOpen ? <X size={18}/> : <Menu size={18}/>}</button>
      <nav className="mobile-menu" aria-label="Mobile navigation">{[...nav, ['/settings', SlidersHorizontal, 'Settings'], ['/help', LifeBuoy, 'Help & Support']].map(([to, Icon, label]) => <Link key={to} to={to} onClick={() => setMobileOpen(false)} className={`mobile-menu-link ${active(to) ? 'active' : ''}`}><Icon size={16}/>{label}</Link>)}</nav>
    </div>
  </aside>
  <header className="app-topbar">
    <div className="min-w-0"><h2 className="truncate text-lg font-extrabold tracking-tight text-slate-900">{title}</h2></div>
    <div className="ml-auto flex items-center gap-2">
      <button onClick={() => setDark(value => !value)} className="topbar-button" aria-label={dark ? 'Use light appearance' : 'Use dark appearance'} title={dark ? 'Use light appearance' : 'Use dark appearance'}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <div className="profile-menu-wrap">
        <button onClick={() => { setNotificationOpen(value => !value); setProfileOpen(false); }} className="topbar-button relative" aria-label={`${unread} unread notifications`} title="Notifications"><Bell size={18}/>{unread > 0 && <span className="notification-dot"/>}</button>
        {notificationOpen && <div className="profile-dropdown notification-dropdown"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-3"><span className="font-bold text-slate-800">Notifications</span>{unread > 0 && <button onClick={readAll} className="notification-read-all">Mark all read</button>}</div>{notifications.length ? notifications.map(notification => <Link key={notification._id} to={notification.link || '#'} onClick={() => readNotification(notification)} className={`notification-item ${notification.read ? '' : 'unread'}`}><span><b>{notification.title}</b><small>{notification.message}</small></span></Link>) : <p className="px-3 py-5 text-center text-xs text-slate-500">No notifications yet.</p>}</div>}
      </div>
      <div className="profile-menu-wrap">
        <button onClick={() => { setProfileOpen(value => !value); setNotificationOpen(false); }} className="topbar-profile" aria-expanded={profileOpen}>
          <span className="sidebar-avatar">{user?.avatar ? <img src={user.avatar} alt=""/> : <UserRound size={17}/>}</span>
          <ChevronDown className={`profile-chevron ${profileOpen ? 'rotate-180' : ''}`} size={15}/>
        </button>
        {profileOpen && <div className="profile-dropdown">
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3"><span className="sidebar-avatar">{user?.avatar ? <img src={user.avatar} alt=""/> : <UserRound size={17}/>}</span><span className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{user?.name || 'DocFlow user'}</p><p className="truncate text-xs text-slate-500">{user?.email || user?.role}</p></span></div>
          {user?.role === 'patient' && <Link to="/profile" onClick={() => setProfileOpen(false)}><UserRound size={16}/>View profile</Link>}
          {user?.role === 'doctor' && <Link to="/availability" onClick={() => setProfileOpen(false)}><CalendarDays size={16}/>Schedule & availability</Link>}
          <Link to="/security" onClick={() => setProfileOpen(false)}><LockKeyhole size={16}/>Account security</Link>
          <button onClick={logout} className="danger"><LogOut size={16}/>Log out</button>
        </div>}
      </div>
    </div>
  </header></>;
}
