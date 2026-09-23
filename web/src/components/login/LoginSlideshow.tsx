import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SlideItem {
  id: string;
  shortLabel: string;
  tag: string;
  title: string;
  subtitle: string;
  badge: string;
  image: string;
  urlPath: string;
  accentColor: string;
  glowRgba: string;
  floatingPill1: {
    icon: string;
    label: string;
  };
  floatingPill2: {
    icon: string;
    label: string;
  };
  metrics: {
    value: string;
    label: string;
  }[];
}

const SLIDES: SlideItem[] = [
  {
    id: 'dashboard',
    shortLabel: 'Command Center',
    tag: 'REAL-TIME WORKFORCE INTELLIGENCE',
    title: 'Division-Wide Executive Command Center',
    subtitle:
      'Gain complete operational transparency with live workforce attendance telemetry, real-time 201 transaction queues, and sub-second analytics on a single pane of glass.',
    badge: 'Enterprise Telemetry • 99.99% Uptime',
    image: '/slides/analytics_command_center.jpg',
    urlPath: 'digital201.deped.gov.ph/admin/dashboard',
    accentColor: '#E3C36A',
    glowRgba: 'rgba(215, 248, 74, 0.22)',
    floatingPill1: {
      icon: '⚡',
      label: 'Sub-Second Real-Time Telemetry',
    },
    floatingPill2: {
      icon: '📊',
      label: '100% Division-Wide Visibility',
    },
    metrics: [
      { value: '100%', label: 'Live Data Accuracy' },
      { value: '4.2x', label: 'Faster Decision Making' },
      { value: '0 sec', label: 'Database Sync Delay' },
    ],
  },
  {
    id: 'records',
    shortLabel: 'Digital 201s',
    tag: 'CIVIL SERVICE FORM 212 & 201 ARCHIVE',
    title: 'CSC Form 212 & Electronic 201 Master Records',
    subtitle:
      'Transform thousands of paper folders into searchable, tamper-proof electronic service cards with automated civil service eligibility verification and digital credential attachments.',
    badge: 'CSC & DepEd Order Compliant',
    image: '/slides/digital_201_records.jpg',
    urlPath: 'digital201.deped.gov.ph/admin/personnel',
    accentColor: '#38BDF8',
    glowRgba: 'rgba(56, 189, 248, 0.22)',
    floatingPill1: {
      icon: '🛡️',
      label: 'Civil Service Form 212 Validated',
    },
    floatingPill2: {
      icon: '📁',
      label: '100% Paperless Service Cards',
    },
    metrics: [
      { value: '92%', label: 'Audit Time Reduction' },
      { value: 'Zero', label: 'Lost 201 Documents' },
      { value: '10k+', label: 'Concurrent Records' },
    ],
  },
  {
    id: 'validation',
    shortLabel: 'Transaction Queue',
    tag: 'MULTI-TIER TRANSACTION PIPELINE',
    title: 'Automated Appointment Validation Engine',
    subtitle:
      'Accelerate transaction throughput by 400% with automated multi-tier routing across Administrative Officers (AO II), HRMO leadership, and division governance.',
    badge: 'Multi-Tier RBAC Approval Engine',
    image: '/slides/validation_pipeline.jpg',
    urlPath: 'digital201.deped.gov.ph/admin/transactions',
    accentColor: '#A78BFA',
    glowRgba: 'rgba(167, 139, 250, 0.22)',
    floatingPill1: {
      icon: '🚀',
      label: 'AO II → HRMO Multi-Tier Pipeline',
    },
    floatingPill2: {
      icon: '✅',
      label: 'Automated Deficiency Detection',
    },
    metrics: [
      { value: '4.0x', label: 'Faster Approval Cycles' },
      { value: '100%', label: 'Audit Trail Accountability' },
      { value: 'Zero', label: 'Compliance Bottlenecks' },
    ],
  },
  {
    id: 'promotions',
    shortLabel: 'Merit Promotions',
    tag: 'OBJECTIVE TALENT MERIT SELECTION',
    title: 'Comparative Assessment Ranking (CAR-RQA)',
    subtitle:
      'Eliminate favoritism and administrative overhead with an automated merit scoring engine and live applicant ranking leaderboards built strictly to DepEd Order No. 007, s. 2023.',
    badge: 'DepEd Order No. 007, s. 2023 Certified',
    image: '/slides/promotion_ranking.jpg',
    urlPath: 'digital201.deped.gov.ph/admin/promotions',
    accentColor: '#FBBF24',
    glowRgba: 'rgba(251, 191, 36, 0.22)',
    floatingPill1: {
      icon: '🏆',
      label: 'Real-Time Merit Leaderboard',
    },
    floatingPill2: {
      icon: '⚖️',
      label: 'Objective Scoring Engine',
    },
    metrics: [
      { value: '100%', label: 'Objective Points Logic' },
      { value: '1-Click', label: 'Certified CAR Export' },
      { value: 'Strict', label: 'Civil Service Standards' },
    ],
  },
];

const AUTOPLAY_INTERVAL = 6500;

export const LoginSlideshow: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const currentSlide = SLIDES[currentIndex];

  return (
    <div
      className="neuro-slideshow-card"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Digital 201 System Showcase Presentation"
    >
      {/* Dynamic Ambient Spotlight Glow behind mockup */}
      <div
        className="showcase-spotlight-glow"
        style={{ background: currentSlide.glowRgba }}
      />

      {/* ─── 1. TOP HEADER BRANDING ───────────────────────────────── */}
      <div className="neuro-slide-top-header">
        <div className="neuro-slide-brand">
          <div className="neuro-brand-emblems">
            <img
              src="/notre_dame_marbel.svg"
              alt="NDMU Crest"
              className="neuro-crest-sm"
            />
            <span className="neuro-cross">×</span>
            <img
              src="/depedlogo.png"
              alt="DepEd Seal"
              className="neuro-crest-sm"
            />
          </div>
          <div className="neuro-brand-text-group">
            <span className="neuro-brand-title">DIGITAL 201</span>
            <span className="neuro-brand-sub">HRIS • ENTERPRISE</span>
          </div>
        </div>

        <div
          className="neuro-slide-pill-badge"
          style={{
            borderColor: `${currentSlide.accentColor}44`,
            color: currentSlide.accentColor,
            background: `${currentSlide.accentColor}14`,
          }}
        >
          {currentSlide.badge}
        </div>
      </div>

      {/* ─── 2. INTERACTIVE FEATURE SELECTOR TABS ─────────────────── */}
      <div className="showcase-nav-pills">
        {SLIDES.map((slide, idx) => {
          const isActive = idx === currentIndex;
          return (
            <button
              key={slide.id}
              type="button"
              className={`showcase-nav-pill ${isActive ? 'is-active' : ''}`}
              style={{
                borderColor: isActive ? slide.accentColor : 'rgba(255, 255, 255, 0.08)',
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)',
                background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'rgba(13, 16, 24, 0.5)',
              }}
              onClick={() => setCurrentIndex(idx)}
            >
              <span
                className="showcase-nav-dot"
                style={{ background: isActive ? slide.accentColor : 'rgba(255, 255, 255, 0.3)' }}
              />
              <span className="showcase-nav-text">{slide.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* ─── 3. HERO SHOWCASE WINDOW (THE FLOATING DEVICE STAGE) ───── */}
      <div className="showcase-stage-area">
        <div className="showcase-browser-frame">
          {/* Top Browser Bar */}
          <div className="showcase-browser-topbar">
            <div className="browser-traffic-lights">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>

            <div className="browser-url-pill">
              <svg className="lock-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="url-text">{currentSlide.urlPath}</span>
              <span className="ssl-badge">SECURE TLS 1.3</span>
            </div>

            <div className="browser-live-indicator">
              <span className="pulse-indicator" style={{ background: currentSlide.accentColor }} />
              <span className="live-text">LIVE DEMO</span>
            </div>
          </div>

          {/* Viewport with Real Feature Screenshot */}
          <div className="showcase-browser-viewport">
            <AnimatePresence mode="wait">
              <motion.img
                key={currentSlide.id}
                src={currentSlide.image}
                alt={currentSlide.title}
                className="showcase-screen-img"
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              />
            </AnimatePresence>
          </div>

          {/* Floating Glassmorphic Highlight Chips */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`pill1-${currentSlide.id}`}
              className="floating-showcase-chip top-right"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.1 }}
            >
              <span className="chip-icon">{currentSlide.floatingPill1.icon}</span>
              <span className="chip-text">{currentSlide.floatingPill1.label}</span>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={`pill2-${currentSlide.id}`}
              className="floating-showcase-chip bottom-left"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="chip-icon">{currentSlide.floatingPill2.icon}</span>
              <span className="chip-text">{currentSlide.floatingPill2.label}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ─── 4. ENTERPRISE PROOF METRICS BAR ───────────────────────── */}
      <div className="showcase-metrics-bar">
        {currentSlide.metrics.map((m, i) => (
          <div key={i} className="showcase-metric-item">
            <div className="metric-val" style={{ color: currentSlide.accentColor }}>
              {m.value}
            </div>
            <div className="metric-lbl">{m.label}</div>
          </div>
        ))}
      </div>

      {/* ─── 5. BOTTOM NARRATIVE & HOOK ────────────────────────────── */}
      <div className="neuro-slide-bottom-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="neuro-caption-block"
          >
            <div className="neuro-slide-tag" style={{ color: currentSlide.accentColor }}>
              {currentSlide.tag}
            </div>
            <h2 className="neuro-slide-title">{currentSlide.title}</h2>
            <p className="neuro-slide-subtitle">{currentSlide.subtitle}</p>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Controls */}
        <div className="neuro-slide-controls-row">
          <div className="neuro-indicators-row">
            {SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                className={`neuro-dash-line ${idx === currentIndex ? 'is-active' : ''}`}
                style={{
                  background: idx === currentIndex ? currentSlide.accentColor : undefined,
                  boxShadow: idx === currentIndex ? `0 0 12px ${currentSlide.accentColor}` : undefined,
                }}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}: ${slide.title}`}
                title={slide.title}
              />
            ))}
          </div>

          <div className="neuro-controls-right">
            <div className="neuro-slide-counter">
              0{currentIndex + 1} / 0{SLIDES.length}
            </div>
            <div className="neuro-slide-arrows">
              <button
                type="button"
                className="neuro-arrow-btn"
                onClick={prevSlide}
                aria-label="Previous slide"
                title="Previous slide"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                className="neuro-arrow-btn"
                onClick={nextSlide}
                aria-label="Next slide"
                title="Next slide"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
