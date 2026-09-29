import React from 'react';
import { Link } from 'react-router-dom';
import { HomeTask, WaitingItem } from './homeTasks';
import './what-to-do.css';

const when = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** "What you need to do" first, then what is waiting for a reviewer. Each row has one action. */
export const WhatToDo: React.FC<{ tasks: HomeTask[]; waiting: WaitingItem[]; onOpenCycle: (cycleId: number) => void }> = ({ tasks, waiting, onOpenCycle }) => (
  <section className="wtd" aria-labelledby="wtd-title">
    <h2 id="wtd-title">What you need to do</h2>
    {tasks.length === 0
      ? <p className="wtd__none">Nothing needs you right now.</p>
      : <ul className="wtd__list">
        {tasks.map(t => (
          <li key={t.key} className={`wtd__task is-${t.kind}`}>
            <div className="wtd__text"><strong>{t.title}</strong><span>{t.detail}</span></div>
            {t.to
              ? <Link className={`btn btn-sm ${t.kind === 'returned' || t.kind === 'application' ? 'btn-primary' : 'btn-secondary'}`} to={t.to}>{t.action}</Link>
              : <button type="button" className="btn btn-sm btn-primary" onClick={() => t.cycleId && onOpenCycle(t.cycleId)}>{t.action}</button>}
          </li>
        ))}
      </ul>}
    {waiting.length > 0 && <>
      <h3 className="wtd__sub">Waiting for a reviewer</h3>
      <ul className="wtd__list">
        {waiting.map(w => (
          <li key={w.key} className="wtd__task is-waiting">
            <div className="wtd__text"><strong>{w.title}</strong><span>{w.detail ? `${w.detail}. ` : ''}Waiting for {w.who}{w.since ? ` since ${when(w.since)}` : ''}. Nothing to do until they reply.</span></div>
            <Link className="btn btn-sm btn-secondary" to={w.to}>View</Link>
          </li>
        ))}
      </ul>
    </>}
  </section>
);
