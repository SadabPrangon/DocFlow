export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};
export const saveAuth = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};
export const clearAuth = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
export const dashboardFor = (role) => ({
  patient: '/dashboard', admin: '/admin-dashboard', doctor: '/doctor-dashboard', receptionist: '/receptionist-dashboard'
}[role] || '/login');
