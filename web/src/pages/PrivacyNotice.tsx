import React from 'react';
import { Link } from 'react-router-dom';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_VERSION } from '../constants/privacyNotice';
import './privacy-notice.css';

/** Public page: anyone can read the Privacy Notice without signing in. */
const PrivacyNotice: React.FC = () => (
  <main className="pn-page">
    <article className="pn-card">
      <p className="pn-kicker">Digital 201 · Schools Division of Koronadal City</p>
      <h1>Privacy Notice</h1>
      <p className="pn-version">Version {PRIVACY_NOTICE_VERSION}</p>
      {PRIVACY_NOTICE.map(s => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.body.map(p => <p key={p}>{p}</p>)}
        </section>
      ))}
      <p className="pn-back"><Link to="/login">Back to sign in</Link></p>
    </article>
  </main>
);

export default PrivacyNotice;
