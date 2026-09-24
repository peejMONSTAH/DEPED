import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { homePathFor } from '../auth/permissions';
import type { UserRole } from '../types';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: readonly UserRole[];
}

/**
 * Route guard. Applied once per layout — nesting it again on child routes only
 * repeats the same check.
 *
 * Authentication state comes from AuthContext alone; reading localStorage here as
 * well used to let the two disagree after a token refresh or logout.
 */
export const RequireAuth: React.FC<RequireAuthProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    return <DeniedRedirect to={homePathFor(user)} />;
  }

  return <>{children}</>;
};

/**
 * A page this role may not open. Say so instead of silently landing the user
 * on their dashboard, which looked like a broken notification or link.
 */
const DeniedRedirect: React.FC<{ to: string }> = ({ to }) => {
  const { addToast } = useToast();
  useEffect(() => {
    addToast('That page is not available for your role, so you were taken to your home page.', 'WARNING');
  }, [addToast]);
  return <Navigate to={to} replace />;
};

/** Sends a signed-in user to their portal, everyone else to login. */
export const RootRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user)} replace />;
};
