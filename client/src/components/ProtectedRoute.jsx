import { Navigate } from 'react-router-dom';
import { getUser } from '../lib/auth';

export default function ProtectedRoute({ roles, children }) {
  const token = localStorage.getItem('token');
  const user = getUser();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}
