import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/LoginPage';
import Register from './pages/RegistrationFlow';
import Dashboard from './pages/Dashboard';
import Doctors from './pages/Doctors';
import BookAppointment from './pages/BookAppointment';
import MyAppointments from './pages/MyAppointments';
import LiveQueue from './pages/LiveQueue';
import Profile from './pages/Profile';
import AIRecommendation from './pages/AIRecommendation';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import DoctorDashboard from './pages/DoctorDashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import ForgotPasswordFlow from './pages/ForgotPasswordFlow';
import Security from './pages/Security';
import Availability from './pages/Availability';
import MedicalRecords from './pages/MedicalRecords';
import ClinicalWorkspace from './pages/ClinicalWorkspace';
import Messages from './pages/Messages';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Operations from './pages/Operations';
import NotificationSettings from './pages/NotificationSettings';
import Settings from './pages/Settings';
import Help from './pages/Help';

const guard = (roles, element) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export default function App(){return <Routes>
  <Route path="/" element={<Home/>}/>
  <Route path="/login" element={<Login/>}/>
  <Route path="/forgot-password" element={<ForgotPasswordFlow/>}/>
  <Route path="/forgot-password/verify" element={<ForgotPasswordFlow/>}/>
  <Route path="/forgot-password/reset" element={<ForgotPasswordFlow/>}/>
  <Route path="/register" element={<Register/>}/>
  <Route path="/register/verify" element={<Register/>}/>
  <Route path="/register/complete" element={<Register/>}/>
  <Route path="/dashboard" element={guard(['patient'],<Dashboard/>)}/>
  <Route path="/doctors" element={guard(['patient'],<Doctors/>)}/>
  <Route path="/book-appointment/:doctorId" element={guard(['patient'],<BookAppointment/>)}/>
  <Route path="/my-appointments" element={guard(['patient'],<MyAppointments/>)}/>
  <Route path="/live-queue" element={guard(['patient'],<LiveQueue/>)}/>
  <Route path="/live-queue/:appointmentId" element={guard(['patient'],<LiveQueue/>)}/>
  <Route path="/profile" element={guard(['patient'],<Profile/>)}/>
  <Route path="/security" element={guard(['patient','admin','doctor','receptionist'],<Security/>)}/>
  <Route path="/settings" element={guard(['patient','admin','doctor','receptionist'],<Settings/>)}/>
  <Route path="/help" element={guard(['patient','admin','doctor','receptionist'],<Help/>)}/>
  <Route path="/availability" element={guard(['doctor'],<Availability/>)}/>
  <Route path="/medical-records" element={guard(['patient'],<MedicalRecords/>)}/>
  <Route path="/clinical-workspace" element={guard(['doctor'],<ClinicalWorkspace/>)}/>
  <Route path="/messages" element={guard(['patient','doctor'],<Messages/>)}/>
  <Route path="/messages/:appointmentId" element={guard(['patient','doctor'],<Messages/>)}/>
  <Route path="/payments" element={guard(['patient'],<Payments/>)}/>
  <Route path="/reports" element={guard(['admin'],<Reports/>)}/>
  <Route path="/operations" element={guard(['admin','receptionist'],<Operations/>)}/>
  <Route path="/notification-settings" element={guard(['patient'],<NotificationSettings/>)}/>
  <Route path="/ai-recommendation" element={guard(['patient'],<AIRecommendation/>)}/>
  <Route path="/admin-dashboard" element={guard(['admin'],<AdminDashboard/>)}/>
  <Route path="/users" element={guard(['admin'],<AdminUsers/>)}/>
  <Route path="/doctor-dashboard" element={guard(['doctor'],<DoctorDashboard/>)}/>
  <Route path="/receptionist-dashboard" element={guard(['receptionist'],<ReceptionistDashboard/>)}/>
  <Route path="*" element={<Home/>}/>
</Routes>}
