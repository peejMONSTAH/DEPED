import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { authApi } from '../../api/auth.api';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { AppIcon } from '../../components/common/AppIcon';
import { DiagonalEnvironment } from '../../components/login/DiagonalEnvironment';

export const MagicLogin: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithTokens } = useAuthContext();
  const { addToast } = useToast();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');
  const [authenticatedName, setAuthenticatedName] = useState('');

  const token = searchParams.get('token');
  const targetRedirect = searchParams.get('redirect');

  useEffect(() => {
    let isMounted = true;

    if (!token) {
      setStatus('error');
      setErrorMessage('No authentication token was provided in the access link.');
      return;
    }

    const performMagicLogin = async () => {
      try {
        const response = await authApi.magicLogin(token);
        const data = response.data.data;

        if (!data || !data.accessToken || !data.user) {
          throw new Error('Authentication response was invalid.');
        }

        if (!isMounted) return;

        // Establish user session
        loginWithTokens(data.accessToken, data.refreshToken, data.user as any);

        const fullName = data.user.personnel
          ? `${data.user.personnel.firstName} ${data.user.personnel.lastName}`
          : data.user.email;

        setAuthenticatedName(fullName);
        setStatus('success');
        addToast(`Welcome back, ${fullName}! 1-Click access verified.`, 'SUCCESS');

        // Resolve target destination
        const destination = targetRedirect || (data.txId ? `/personnel/checklist?txId=${data.txId}` : '/personnel/home');

        // Redirect after brief pleasant confirmation
        setTimeout(() => {
          if (isMounted) {
            navigate(destination, { replace: true });
          }
        }, 1200);
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        const apiMsg = err.response?.data?.message || err.message;
        setErrorMessage(
          apiMsg || 'This 1-click access link is invalid, has expired, or has already been used. Please log in with your account credentials.'
        );
      }
    };

    performMagicLogin();

    return () => {
      isMounted = false;
    };
  }, [token, targetRedirect, loginWithTokens, navigate, addToast]);

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0A192F',
      overflow: 'hidden',
      padding: '24px',
    }}>
      {/* Visual background environment */}
      <DiagonalEnvironment />

      {/* Center Auth Card */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        maxWidth: '480px',
        width: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '20px',
        padding: '36px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center',
        color: '#FFFFFF',
      }}>
        {/* DepEd Seal Header */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1E3A8A 0%, #3F9265 100%)',
          border: '2px solid #F59E0B',
          boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
          marginBottom: '20px',
        }}>
          <AppIcon name="lock" size={28} color="#F59E0B" />
        </div>

        <div style={{
          fontSize: '0.75rem',
          fontWeight: 800,
          letterSpacing: '1.5px',
          color: '#F59E0B',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}>
          DepEd SDO Koronadal City
        </div>

        <h2 style={{
          fontSize: '1.45rem',
          fontWeight: 800,
          letterSpacing: '-0.5px',
          margin: '0 0 10px 0',
        }}>
          Digital 201 Magic Access
        </h2>

        {status === 'verifying' && (
          <div style={{ padding: '24px 0 10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
              <LoadingSpinner size="lg" />
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#DCE6DE', marginBottom: '6px' }}>
              Verifying Security Token…
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Authenticating your personnel credentials and preparing your document checklist workspace.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ padding: '20px 0 10px 0' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              border: '2px solid #10B981',
              color: '#10B981',
              marginBottom: '16px',
            }}>
              <AppIcon name="check" size={28} color="#10B981" />
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34D399', marginBottom: '6px' }}>
              Access Granted!
            </div>
            <p style={{ fontSize: '0.875rem', color: '#DCE6DE', margin: '0 0 8px 0' }}>
              Welcome back, <strong>{authenticatedName}</strong>.
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: 0 }}>
              Opening your deficient documents checklist now…
            </p>
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '20px 0 10px 0' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '2px solid #EF4444',
              color: '#EF4444',
              marginBottom: '16px',
            }}>
              <AppIcon name="close" size={28} color="#EF4444" />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#F87171', marginBottom: '8px' }}>
              Link Expired or Invalid
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#C5D4C8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              style={{
                width: '100%',
                padding: '12px 20px',
                backgroundColor: '#2F7D52',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#276A45')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2F7D52')}
            >
              Proceed to Standard DepEd Login →
            </button>
          </div>
        )}

        {/* Footer info */}
        <div style={{
          marginTop: '28px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.6875rem',
          color: '#5B6B60',
        }}>
          Official DepEd SDO Koronadal City HRIS • Encrypted Transmission
        </div>
      </div>
    </div>
  );
};
