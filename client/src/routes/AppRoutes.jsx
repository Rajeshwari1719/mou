import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import PublicRoute from './PublicRoute';

const LoginPage = lazy(() => import('../pages/auth/Login'));
const SignupPage = lazy(() => import('../pages/auth/Signup'));
const DashboardPage = lazy(() => import('../pages/Dashboard'));
const MOUsPage = lazy(() => import('../pages/MOUs'));
const CreateMOUPage = lazy(() => import('../pages/CreateMOU'));
const EditMOUPage = lazy(() => import('../pages/EditMOU'));
const MOUDetailsPage = lazy(() => import('../pages/MOUDetails'));
const InternsPage = lazy(() => import('../pages/Interns'));
const ProjectsPage = lazy(() => import('../pages/Projects'));
const ProjectDetailsPage = lazy(() => import('../pages/ProjectDetails'));
const DocumentsPage = lazy(() => import('../pages/Documents'));
const ReportsPage = lazy(() => import('../pages/Reports'));
const NotificationsPage = lazy(() => import('../pages/Notifications'));
const ProfilePage = lazy(() => import('../pages/Profile'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));
const StudentsPage = lazy(() => import('../pages/Students'));
const AuditLogsPage = lazy(() => import('../pages/AuditLogs'));

const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600" role="status">Loading page...</div>}>
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mous" element={<MOUsPage />} />
          <Route path="/mous/:id" element={<MOUDetailsPage />} />
          <Route path="/interns" element={<InternsPage />} />
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/students" element={<StudentsPage />} />
          </Route>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/mous/new" element={<CreateMOUPage />} />
            <Route path="/mous/:id/edit" element={<EditMOUPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
};

export default AppRoutes;
