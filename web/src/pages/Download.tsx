import React from 'react';
import { Link } from 'react-router-dom';
import { Digital201Logo } from '../components/common/Digital201Logo';
import './download.css';

/** The hosted Android APK. The QR code below opens the same file page. */
const APK_URL = 'https://www.mediafire.com/file/eg5ginw247u0h4m/Digital201-v1.1.1-20261005b.apk/file';

/**
 * Real screenshots of the Android app, shown inside the phones. Add files under
 * /public/brand/app-screens and list them here. Until then each phone shows only
 * the app's own icon and lockup: no screen is drawn or invented.
 */
const APP_SCREENS: Array<{ src: string; alt: string }> = [];

const Phone: React.FC<{ index: number; className: string }> = ({ index, className }) => {
  const shot = APP_SCREENS[index];
  return (
    <div className={`dl-phone ${className}`}>
      <div className="dl-phone__screen">
        {shot ? (
          <img src={shot.src} alt={shot.alt} loading="lazy" />
        ) : (
          <div className="dl-phone__brand" role="img" aria-label="Digital 201 app icon and name">
            <img src="/brand/digital201-app-icon-192.png" alt="" width={84} height={84} />
            <img src="/brand/digital201-header-lockup.png" alt="" className="dl-phone__lockup" />
          </div>
        )}
      </div>
    </div>
  );
};

/** Public page: no sign-in needed. Reachable from the login page. */
export const DownloadPage: React.FC = () => (
  <div className="dl">
    <header className="dl__bar">
      <Link to="/login" className="dl__brand" aria-label="Digital 201, back to sign in">
        <Digital201Logo variant="wordmark" size="sm" />
      </Link>
      <Link to="/login" className="dl__weblink">Continue on the web</Link>
    </header>

    <main className="dl__grid">
      <section className="dl__text" aria-labelledby="dl-title">
        <h1 id="dl-title" className="dl__title">Get the Digital 201 app</h1>
        <p className="dl__lede">Access your 201 files, track applications, and receive updates from your school and HR office.</p>
        <a className="dl__cta" href={APK_URL} rel="noopener">Download Android APK</a>
        <p className="dl__note">Android phones only. You sign in with your existing Digital 201 account.</p>
      </section>

      <div className="dl__visual" aria-label="The Digital 201 Android app">
        <Phone index={1} className="dl-phone--back" />
        <Phone index={0} className="dl-phone--front" />
      </div>

      <section className="dl__steps" aria-labelledby="dl-steps-title">
        <h2 id="dl-steps-title" className="dl__h2">How to install</h2>
        <ol className="dl__list">
          <li><strong>Download.</strong> Tap <em>Download Android APK</em> (or scan the code). The link opens a file page; choose its Download button.</li>
          <li><strong>Open the file.</strong> When the download finishes, open it from your notifications or Downloads folder. If Android asks, allow installs from your browser for this one file, then tap Install.</li>
          <li><strong>Sign in.</strong> Open Digital 201 and sign in with the email and password of your existing account. Accounts are issued by your school&apos;s AO II or the Division HR office; the app does not create accounts.</li>
        </ol>
        <p className="dl__web">Prefer not to install anything? <Link to="/login" className="dl__link">Continue on the web</Link></p>
      </section>

      <aside className="dl__qr" aria-labelledby="dl-qr-label">
        <img
          src="/brand/digital201-apk-qr.svg"
          alt="QR code that opens the Digital 201 Android APK download"
          width={220}
          height={220}
        />
        <p id="dl-qr-label" className="dl__qrlabel">Scan to download on your phone.</p>
      </aside>
    </main>
  </div>
);

export default DownloadPage;
