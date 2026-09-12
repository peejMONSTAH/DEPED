import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { PersonnelLayout } from './layouts/PersonnelLayout';

// Pages
import { LoginPage } from './pages/Login';
import { MagicLogin } from './pages/auth/MagicLogin';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { AdminNotifications } from './pages/admin/Notifications';
import { TransactionQueue } from './pages/admin/TransactionQueue';
import { DocumentValidation } from './pages/admin/DocumentValidation';
import { TransactionApproval } from './pages/admin/TransactionApproval';
import { PersonnelManagement } from './pages/admin/PersonnelManagement';
import { PromotionManagement } from './pages/admin/PromotionManagement';
import { CredentialDistribution } from './pages/admin/CredentialDistribution';
import { ComplianceMonitoring } from './pages/admin/ComplianceMonitoring';
import { AuditLog } from './pages/admin/AuditLog';
import { Reports } from './pages/admin/Reports';
import { Settings } from './pages/admin/Settings';
import { PlantillaManagement } from './pages/admin/PlantillaManagement';

// Personnel Pages (Mobile Web Portal)
import { PersonnelHome } from './pages/personnel/Home';
import { MyTransactions } from './pages/personnel/MyTransactions';
import { NewTransaction } from './pages/personnel/NewTransaction';
import { ProfileCompletion } from './pages/personnel/ProfileCompletion';
import { Checklist } from './pages/personnel/Checklist';
import { UploadDocument } from './pages/personnel/UploadDocument';
import { PersonnelNotifications } from './pages/personnel/Notifications';
import { CareerRecord } from './pages/personnel/CareerRecord';

// Auth Guard component
const RequireAuth: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuthContext();
  const token = localStorage.getItem('accessToken');

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !user || !token) {
    return <Navigate to="/login" replace />;
  }

  const isPersonnel = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(user.role);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={isPersonnel ? '/personnel/home' : '/admin/dashboard'} replace />;
  }

  return <>{children}</>;
};

// Root Redirect component based on login
const RootRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuthContext();
  const token = localStorage.getItem('accessToken');

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !user || !token) {
    return <Navigate to="/login" replace />;
  }

  const isPersonnel = ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'].includes(user.role);
  return <Navigate to={isPersonnel ? '/personnel/home' : '/admin/dashboard'} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/magic-login" element={<MagicLogin />} />

            {/* ─── Admin / Staff Web Portal ─────────────────────────────────── */}
            <Route
              path="/admin"
              element={
                <RequireAuth allowedRoles={['SYSTEM_ADMIN', 'AO_II', 'HRMO']}>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              {/* Shared — all admin roles */}
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="transactions" element={<TransactionQueue />} />
              <Route path="transactions/:id" element={<TransactionQueue />} />

              {/* AO II Step 4 & 5: Document Validation & School Qualification */}
              <Route
                path="documents"
                element={
                  <RequireAuth allowedRoles={['AO_II']}>
                    <DocumentValidation />
                  </RequireAuth>
                }
              />

              {/* HRMO Step 1-3: Transaction Approval & Non-Teaching Qualification */}
              <Route
                path="approvals"
                element={
                  <RequireAuth allowedRoles={['HRMO']}>
                    <TransactionApproval />
                  </RequireAuth>
                }
              />

              {/* HRMO Step 4 & 5: Compliance Monitoring */}
              <Route
                path="compliance"
                element={
                  <RequireAuth allowedRoles={['HRMO']}>
                    <ComplianceMonitoring />
                  </RequireAuth>
                }
              />

              {/* Personnel Management — shared view */}
              <Route path="personnel" element={<PersonnelManagement />} />

              {/* Sys Admin + AO II: Account Creation & Credential Distribution (Steps 1-3) */}
              <Route
                path="credentials"
                element={
                  <RequireAuth allowedRoles={['SYSTEM_ADMIN', 'AO_II']}>
                    <CredentialDistribution />
                  </RequireAuth>
                }
              />

              {/* HRMO & AO II: Promotion Management */}
              <Route
                path="promotions"
                element={
                  <RequireAuth allowedRoles={['HRMO', 'AO_II']}>
                    <PromotionManagement />
                  </RequireAuth>
                }
              />

              {/* HRMO & AO II: Plantilla Registry & Item Assignment */}
              <Route
                path="plantilla"
                element={
                  <RequireAuth allowedRoles={['HRMO', 'AO_II']}>
                    <PlantillaManagement />
                  </RequireAuth>
                }
              />

              {/* Sys Admin only: Audit Trail (Step 5) */}
              <Route
                path="audit"
                element={
                  <RequireAuth allowedRoles={['SYSTEM_ADMIN']}>
                    <AuditLog />
                  </RequireAuth>
                }
              />

              {/* Shared reports */}
              <Route path="reports" element={<Reports />} />

              {/* Sys Admin only: Settings + Roles & Permissions (Step 4) */}
              <Route
                path="settings"
                element={
                  <RequireAuth allowedRoles={['SYSTEM_ADMIN']}>
                    <Settings />
                  </RequireAuth>
                }
              />

              <Route index element={<Navigate to="dashboard" replace />} />
            </Route>

            {/* ─── Personnel Mobile Web Portal ──────────────────────────────── */}
            <Route
              path="/personnel"
              element={
                <RequireAuth allowedRoles={['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL']}>
                  <PersonnelLayout />
                </RequireAuth>
              }
            >
              {/* Step 1: Account received — Login → Home */}
              <Route path="home" element={<PersonnelHome />} />

              {/* Step 3: Profile Completion (PDS, WES, Employment, Contact) */}
              <Route path="profile-completion" element={<ProfileCompletion />} />

              {/* Step 9: Notification Monitoring */}
              <Route path="notifications" element={<PersonnelNotifications />} />

              {/* Step 10: Service Record Viewing */}
              <Route path="profile" element={<CareerRecord />} />

              {/* Step 4: Transaction Selection */}
              <Route path="new-transaction" element={<NewTransaction />} />

              {/* Steps 5–8: Checklist → Upload → Compliance → Submit */}
              <Route path="checklist" element={<Checklist />} />
              <Route path="upload-document" element={<UploadDocument />} />

              {/* My Transactions list */}
              <Route path="transactions" element={<MyTransactions />} />

              <Route index element={<Navigate to="home" replace />} />
            </Route>

            {/* Wildcard / Fallback redirects */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </BrowserRouter>
);
};
export default App;
