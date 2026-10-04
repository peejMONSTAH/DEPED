import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccessSessions } from './AccessSessions';
import { Settings } from './Settings';
import { ServiceHealth } from './ServiceHealth';
import { EmailDelivery } from './EmailDelivery';
import './system-tabs.css';

interface Tab { key: string; label: string; element: React.ReactNode }

/** Related System Administrator pages under one menu item. The tab is kept in `?tab=` so a link opens the right one. */
const Tabs: React.FC<{ label: string; tabs: Tab[] }> = ({ label, tabs }) => {
  const [params, setParams] = useSearchParams();
  const current = tabs.find(t => t.key === params.get('tab')) ?? tabs[0];
  return (
    <>
      <div className="st-bar"><div className="st-tabs" role="tablist" aria-label={label}>
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === current.key} className={`st-tab${t.key === current.key ? ' is-active' : ''}`}
            onClick={() => setParams(t.key === tabs[0].key ? {} : { tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div></div>
      <div role="tabpanel" className="st-panel">{current.element}</div>
    </>
  );
};

/** Menu item "Access & security": who is signed in where, and the account/sign-in/email security picture. */
export const AccessSecurity: React.FC = () => (
  <Tabs label="Access and security" tabs={[
    { key: 'sessions', label: 'Sessions & devices', element: <AccessSessions /> },
    { key: 'security', label: 'Security overview', element: <Settings /> },
  ]} />
);

/** Menu item "Service health": whether the system's parts are running, and the email queue. */
export const SystemHealth: React.FC = () => (
  <Tabs label="Service health" tabs={[
    { key: 'health', label: 'Service health', element: <ServiceHealth /> },
    { key: 'email', label: 'Email delivery', element: <EmailDelivery /> },
  ]} />
);
