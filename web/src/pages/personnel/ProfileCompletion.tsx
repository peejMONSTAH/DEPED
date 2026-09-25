import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';
import { useAuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AppIcon } from '../../components/common/AppIcon';
import './profile.css';

/**
 * Profile: the details entered when the account was created, and the
 * password. Anything on the official record is locked (AO II / HRMO maintain
 * it); a field they left blank may be filled in here, once. Contact details
 * stay editable. Documents live in My 201 Files, not here.
 */

type Person = {
  employeeId: string; firstName: string; lastName: string; middleName: string | null; suffix: string | null;
  birthDate: string | null; gender: string | null; civilStatus: string | null; contactNumber: string | null;
  address: string | null; school: string | null; district: string | null; designation: string | null;
  dateHired: string | null; plantillaItem: { itemNumber: string; positionTitle: string; salaryGrade: number } | null;
  user?: { email: string; role?: { name: string } };
};

type FieldKey = 'middleName' | 'suffix' | 'birthDate' | 'gender' | 'civilStatus' | 'designation' | 'dateHired';
const FILLABLE: { key: FieldKey; label: string; kind: 'text' | 'date' | 'select'; options?: string[] }[] = [
  { key: 'middleName', label: 'Middle name', kind: 'text' },
  { key: 'suffix', label: 'Suffix', kind: 'select', options: ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] },
  { key: 'birthDate', label: 'Date of birth', kind: 'date' },
  { key: 'gender', label: 'Sex', kind: 'select', options: ['MALE', 'FEMALE'] },
  { key: 'civilStatus', label: 'Civil status', kind: 'select', options: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'] },
  { key: 'designation', label: 'Position', kind: 'text' },
  { key: 'dateHired', label: 'Date of first appointment', kind: 'date' },
];

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim());
const pretty = (key: FieldKey, v: string | null) => {
  if (blank(v)) return '';
  if (key === 'birthDate' || key === 'dateHired') {
    return new Date(v!).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }
  if (key === 'gender' || key === 'civilStatus') return v!.charAt(0) + v!.slice(1).toLowerCase();
  return v!;
};
const todayManila = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

const Row: React.FC<{ label: string; value?: React.ReactNode; locked?: boolean }> = ({ label, value, locked = true }) => (
  <div className="profile-row">
    <dt>{label}</dt>
    <dd>
      <span>{value || <span className="text-muted">Not recorded</span>}</span>
      {locked && value ? <AppIcon name="lock" size={12} color="var(--color-text-muted)" aria-label="Locked" /> : null}
    </dd>
  </div>
);

export const ProfileCompletion: React.FC = () => {
  const { user, logout } = useAuthContext();
  const { addToast } = useToast();
  const [person, setPerson] = useState<Person | null>(null);
  const [loadError, setLoadError] = useState('');
  const [fill, setFill] = useState<Partial<Record<FieldKey, string>>>({});
  const [savingFill, setSavingFill] = useState(false);
  const [contact, setContact] = useState<{ phone: string; address: string } | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/personnel/me');
      setPerson(res.data?.data);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.response?.data?.message || 'Could not load your profile.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const missing = person ? FILLABLE.filter(f => blank(person[f.key])) : [];

  const saveFill = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(fill).filter(([, v]) => !blank(v)).map(([k, v]) => [k, String(v).trim()]));
    if (!Object.keys(body).length) { addToast('Fill in at least one missing detail.', 'ERROR'); return; }
    setSavingFill(true);
    try {
      await apiClient.put('/personnel/me', body);
      addToast('Details saved to your record. They are now locked.', 'SUCCESS');
      setFill({});
      await load();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not save these details.', 'ERROR');
    } finally { setSavingFill(false); }
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    const phone = contact.phone.trim();
    const address = contact.address.trim();
    if (!phone || !address) { addToast('Enter both a contact number and an address.', 'ERROR'); return; }
    setSavingContact(true);
    try {
      await apiClient.put('/personnel/me', { contactNumber: phone, address });
      addToast('Contact details updated.', 'SUCCESS');
      setContact(null);
      await load();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not update your contact details.', 'ERROR');
    } finally { setSavingContact(false); }
  };

  // Same rule the server enforces (≥12 chars, upper, lower, number, symbol).
  const pwRules = [
    { ok: pw.next.length >= 12, text: 'At least 12 characters' },
    { ok: /[A-Z]/.test(pw.next) && /[a-z]/.test(pw.next), text: 'Upper- and lowercase letters' },
    { ok: /[0-9]/.test(pw.next), text: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(pw.next), text: 'A symbol' },
    { ok: pw.next.length > 0 && pw.next === pw.confirm, text: 'Both new passwords match' },
  ];
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.current || pwRules.some(r => !r.ok)) { addToast('Check the password requirements.', 'ERROR'); return; }
    setSavingPw(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      addToast('Password changed. Sign in again with your new password.', 'SUCCESS');
      setPw({ current: '', next: '', confirm: '' });
      await logout();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Could not change your password.', 'ERROR');
    } finally { setSavingPw(false); }
  };

  if (loadError) {
    return (
      <div className="personnel-content-container">
        <div className="card" role="alert" style={{ padding: 20 }}>
          {loadError} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!person) return <div className="personnel-content-container"><p className="text-muted">Loading your profile…</p></div>;

  const fullName = [person.firstName, person.middleName, person.lastName, person.suffix].filter(Boolean).join(' ');

  return (
    <div className="animate-fade-in personnel-content-container profile-page">
      <h1 className="topbar-title" style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px' }}>Profile</h1>

      <section className="card profile-card" aria-labelledby="profile-account">
        <h2 id="profile-account">Account</h2>
        <dl>
          <Row label="Name" value={fullName} />
          <Row label="Employee ID" value={person.employeeId} />
          <Row label="Email (sign-in)" value={person.user?.email || user?.email} />
          <Row label="Station" value={[person.school, person.district].filter(Boolean).join(', ')} />
          {person.plantillaItem && (
            <Row label="Plantilla item" value={`${person.plantillaItem.itemNumber} · ${person.plantillaItem.positionTitle} (SG ${person.plantillaItem.salaryGrade})`} />
          )}
        </dl>
      </section>

      <section className="card profile-card" aria-labelledby="profile-record">
        <h2 id="profile-record">Personal and appointment details</h2>
        <p className="text-sm text-muted profile-note">
          Details on your official record are locked and maintained by your AO II or HRMO. Ask them to correct anything that is wrong.
        </p>
        <dl>
          {FILLABLE.filter(f => !blank(person[f.key])).map(f => <Row key={f.key} label={f.label} value={pretty(f.key, person[f.key])} />)}
        </dl>
        {missing.length > 0 && (
          <form onSubmit={saveFill} className="profile-fill">
            <div className="profile-fill-head">
              <AppIcon name="warning" size={14} color="var(--color-warning)" />
              <span>These were left blank when your account was made. Fill them in once; they lock after saving.</span>
            </div>
            {missing.map(f => (
              <label key={f.key} className="profile-field">
                <span>{f.label}</span>
                {f.kind === 'select' ? (
                  <select className="form-input" value={fill[f.key] || ''} disabled={savingFill}
                    onChange={e => setFill({ ...fill, [f.key]: e.target.value })}>
                    <option value="">Select…</option>
                    {f.options!.map(o => <option key={o} value={o}>{pretty(f.key === 'suffix' ? 'middleName' : f.key, o)}</option>)}
                  </select>
                ) : (
                  <input className="form-input" type={f.kind} max={f.kind === 'date' ? todayManila() : undefined} maxLength={100}
                    value={fill[f.key] || ''} disabled={savingFill} onChange={e => setFill({ ...fill, [f.key]: e.target.value })} />
                )}
              </label>
            ))}
            <div className="profile-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingFill}>{savingFill ? 'Saving…' : 'Save details'}</button>
            </div>
          </form>
        )}
      </section>

      <section className="card profile-card" aria-labelledby="profile-contact">
        <div className="profile-card-head">
          <h2 id="profile-contact">Contact details</h2>
          {!contact && (
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setContact({ phone: person.contactNumber || '', address: person.address || '' })}>Edit</button>
          )}
        </div>
        {contact ? (
          <form onSubmit={saveContact} className="profile-form">
            <label className="profile-field">
              <span>Contact number</span>
              <input className="form-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={13} placeholder="09XXXXXXXXX"
                value={contact.phone} disabled={savingContact} onChange={e => setContact({ ...contact, phone: e.target.value })} />
            </label>
            <label className="profile-field">
              <span>Address</span>
              <textarea className="form-input" rows={2} maxLength={300} autoComplete="street-address"
                value={contact.address} disabled={savingContact} onChange={e => setContact({ ...contact, address: e.target.value })} />
            </label>
            <div className="profile-actions">
              <button type="button" className="btn btn-secondary btn-sm" disabled={savingContact} onClick={() => setContact(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingContact}>{savingContact ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : (
          <dl>
            <Row label="Contact number" value={person.contactNumber} locked={false} />
            <Row label="Address" value={person.address} locked={false} />
          </dl>
        )}
      </section>

      <section className="card profile-card" aria-labelledby="profile-password">
        <h2 id="profile-password">Change password</h2>
        <form onSubmit={changePassword} className="profile-form">
          <label className="profile-field">
            <span>Current password</span>
            <input className="form-input" type="password" autoComplete="current-password" value={pw.current} disabled={savingPw}
              onChange={e => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="profile-field">
            <span>New password</span>
            <input className="form-input" type="password" autoComplete="new-password" value={pw.next} disabled={savingPw}
              onChange={e => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label className="profile-field">
            <span>Confirm new password</span>
            <input className="form-input" type="password" autoComplete="new-password" value={pw.confirm} disabled={savingPw}
              onChange={e => setPw({ ...pw, confirm: e.target.value })} />
          </label>
          {pw.next && (
            <ul className="profile-pw-rules" aria-label="Password requirements">
              {pwRules.map(r => (
                <li key={r.text} style={{ color: r.ok ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <AppIcon name={r.ok ? 'approved' : 'pending'} size={12} /> {r.text}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted" style={{ margin: 0 }}>You will be signed out and asked to sign in with the new password.</p>
          <div className="profile-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingPw || !pw.current || pwRules.some(r => !r.ok)}>
              {savingPw ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
