import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { RequireAuth, RootRedirect } from './routes/RequireAuth';
import { ADMIN_PORTAL_ROLES, PERSONNEL_ROLES } from './auth/permissions';

// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { PersonnelLayout } from './layouts/PersonnelLayout';

// Pages
import { LoginPage } from './pages/Login';
const MagicLogin = React.lazy(() => import('./pages/auth/MagicLogin').then(m => ({ default: m.MagicLogin })));
const SetupAccount = React.lazy(() => import('./pages/auth/SetupAccount').then(m => ({ default: m.SetupAccount })));

// Admin Pages
const AdminDashboard = React.lazy(() => import('./pages/admin/Dashboard').then(m => ({ default: m.AdminDashboard })));
const AdminNotifications = React.lazy(() => import('./pages/admin/Notifications').then(m => ({ default: m.AdminNotifications })));
const TransactionQueue = React.lazy(() => import('./pages/admin/TransactionQueue').then(m => ({ default: m.TransactionQueue })));
const DocumentValidation = React.lazy(() => import('./pages/admin/DocumentValidation').then(m => ({ default: m.DocumentValidation })));
const TransactionApproval = React.lazy(() => import('./pages/admin/TransactionApproval').then(m => ({ default: m.TransactionApproval })));
const PersonnelManagement = React.lazy(() => import('./pages/admin/PersonnelManagement').then(m => ({ default: m.PersonnelManagement })));
const PromotionManagement = React.lazy(() => import('./pages/admin/PromotionManagement').then(m => ({ default: m.PromotionManagement })));
const CredentialDistribution = React.lazy(() => import('./pages/admin/CredentialDistribution').then(m => ({ default: m.CredentialDistribution })));
const ComplianceMonitoring = React.lazy(() => import('./pages/admin/ComplianceMonitoring').then(m => ({ default: m.ComplianceMonitoring })));
const AuditLog = React.lazy(() => import('./pages/admin/AuditLog').then(m => ({ default: m.AuditLog })));
const Reports = React.lazy(() => import('./pages/admin/Reports').then(m => ({ default: m.Reports })));
const Settings = React.lazy(() => import('./pages/admin/Settings').then(m => ({ default: m.Settings })));
const PlantillaManagement = React.lazy(() => import('./pages/admin/PlantillaManagement').then(m => ({ default: m.PlantillaManagement })));

// Personnel Pages (Mobile Web Portal)
const PersonnelHome = React.lazy(() => import('./pages/personnel/Home').then(m => ({ default: m.PersonnelHome })));
const MyTransactions = React.lazy(() => import('./pages/personnel/MyTransactions').then(m => ({ default: m.MyTransactions })));
const ProfileCompletion = React.lazy(() => import('./pages/personnel/ProfileCompletion').then(m => ({ default: m.ProfileCompletion })));
const Checklist = React.lazy(() => import('./pages/personnel/Checklist').then(m => ({ default: m.Checklist })));
const UploadDocument = React.lazy(() => import('./pages/personnel/UploadDocument').then(m => ({ default: m.UploadDocument })));
const FillDocument = React.lazy(() => import('./pages/personnel/FillDocument'));
const MyDocuments = React.lazy(() => import('./pages/personnel/MyDocuments').then(m => ({ default: m.MyDocuments })));
const PersonnelNotifications = React.lazy(() => import('./pages/personnel/Notifications').then(m => ({ default: m.PersonnelNotifications })));
const CareerRecord = React.lazy(() => import('./pages/personnel/CareerRecord').then(m => ({ default: m.CareerRecord })));

/** Shown while a route chunk downloads. Deliberately quiet: route chunks are
 * small and usually arrive within a frame or two, so a spinner would flicker. */
const RouteFallback: React.FC = () => (
  <div style={{ padding: 24, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading…</div>
);

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
          <AuthProvider>
            <React.Suspense fallback={<RouteFallback />}>
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/magic-login" element={<MagicLogin />} />
            <Route path="/auth/setup-account" element={<SetupAccount />} />

            {/* ─── Admin / Staff Web Portal ─────────────────────────────────── */}
            <Route
              path="/admin"
              element={
                <RequireAuth allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              {/* Shared — all admin roles */}
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="notifications" element={<AdminNotifications />} />
              {/* The HR workflow queue: AO II validates, HRMO approves. */}
              <Route path="transactions" element={<RequireAuth allowedRoles={['AO_II', 'HRMO']}><TransactionQueue /></RequireAuth>} />
              <Route path="transactions/:id" element={<RequireAuth allowedRoles={['AO_II', 'HRMO']}><TransactionQueue /></RequireAuth>} />

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

              {/* Personnel Records Management — AO II & HRMO only */}
              <Route
                path="personnel"
                element={
                  <RequireAuth allowedRoles={['AO_II', 'HRMO']}>
                    <PersonnelManagement />
                  </RequireAuth>
                }
              />

              {/* Sys Admin + AO II: Account Creation & Credential Distribution (Steps 1-3) */}
              <Route
                path="credentials"
                element={
                  <RequireAuth allowedRoles={['SYSTEM_ADMIN', 'AO_II']}>
                    <CredentialDistribution />
                  </RequireAuth>
                }
              />

              {/* HRMO and AO II: Promotion Management */}
              <Route
                path="promotions"
                element={
                  <RequireAuth allowedRoles={['AO_II', 'HRMO']}>
                    <PromotionManagement />
                  </RequireAuth>
                }
              />

              {/* HRMO only: Plantilla Registry & Item Assignment */}
              <Route
                path="plantilla"
                element={
                  <RequireAuth allowedRoles={['HRMO']}>
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

              {/* Sys Admin only: Reports */}
              <Route
                path="reports"
                element={
                  <RequireAuth allowedRoles={['SYSTEM_ADMIN']}>
                    <Reports />
                  </RequireAuth>
                }
              />

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
                <RequireAuth allowedRoles={PERSONNEL_ROLES}>
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
              <Route path="new-transaction" element={<Navigate to="/personnel/transactions" replace />} />

              {/* Steps 5–8: Checklist → Upload → Compliance → Submit */}
              <Route path="checklist" element={<Checklist />} />
              <Route path="upload-document" element={<UploadDocument />} />
              <Route path="fill-document" element={<FillDocument />} />

              {/* My Transactions list */}
              <Route path="transactions" element={<MyTransactions />} />

              {/* My Documents (Digital 201 file) */}
              <Route path="documents" element={<MyDocuments />} />

              <Route index element={<Navigate to="home" replace />} />
            </Route>

            {/* Wildcard / Fallback redirects */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </React.Suspense>
        </AuthProvider>
          </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </BrowserRouter>
    </QueryClientProvider>
);
};
export default App;
