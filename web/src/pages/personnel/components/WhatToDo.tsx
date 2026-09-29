import React from 'react';
import { Link } from 'react-router-dom';
import { HomeTask, WaitingItem } from './homeTasks';
import './what-to-do.css';

const when = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** What needs this person first, then what is with AO II or HRMO. One button per row. */
export const WhatToDo: React.FC<{ tasks: HomeTask[]; waiting: WaitingItem[] }> = ({ tasks, waiting }) => (
  <>
    <section className="wtd" aria-labelledby="wtd-title">
      <h2 id="wtd-title">What you need to do</h2>
      {tasks.length === 0
        ? <p className="wtd__none">Nothing needs you right now. {waiting.length ? 'Your items below are with a reviewer.' : 'Your next step will appear here when there is one.'}</p>
        : <ul className="wtd__list">
          {tasks.map(t => (
            <li key={t.key} className={`wtd__task is-${t.kind}`}>
              <div className="wtd__text"><strong>{t.title}</strong><span>{t.detail}</span></div>
              {t.to && <Link className={`btn btn-sm ${t.kind === 'returned' || t.kind === 'application' ? 'btn-primary' : 'btn-secondary'}`} to={t.to}>{t.action}</Link>}
            </li>
          ))}
        </ul>}
    </section>
    {waiting.length > 0 && (
      <section className="wtd wtd--waiting" aria-labelledby="wtd-waiting">
        <h2 id="wtd-waiting">With a reviewer</h2>
        <p className="wtd__none">Nothing to do on these until the reviewer replies.</p>
        <ul className="wtd__list">
          {waiting.map(w => (
            <li key={w.key} className="wtd__task is-waiting">
              <div className="wtd__text">
                <strong>{w.title}</strong>
                <span>{w.detail ? `${w.detail} · ` : ''}With {w.who}{w.since ? ` since ${when(w.since)}` : ''}</span>
              </div>
              <Link className="btn btn-sm btn-secondary" to={w.to}>View</Link>
            </li>
          ))}
        </ul>
      </section>
    )}
  </>
);
