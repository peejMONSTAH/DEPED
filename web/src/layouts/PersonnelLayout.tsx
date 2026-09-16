import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '../components/admin/Sidebar';
import { ToastContainer } from '../components/shared/ToastContainer';
import { AppIcon } from '../components/common/AppIcon';

import type { Variants } from 'framer-motion';

const pageVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.18,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export const PersonnelLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const currentOutlet = useOutlet();
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Smoothly reset scroll position to top whenever navigating to a new personnel route
  useEffect(() => {
    if (workspaceRef.current) {
      workspaceRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  return (
    <div className="shell-viewport-root">
      {/* Outer Centered Application Shell Frame */}
      <div className="app-shell-frame">
        {/* Dark Integrated Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Responsive Glassmorphic Workspace Area */}
        <div className="app-workspace-area" ref={workspaceRef}>
          {/* Mobile Topbar */}
          <div className="mobile-admin-topbar">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              aria-controls="primary-navigation"
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-trigger"
            >
              <AppIcon name="menu" size={20} />
            </button>
            <span className="mobile-app-title">Digital 201 · Personnel</span>
          </div>

          <main className="workspace-main-content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="page-transition-container"
              >
                {currentOutlet}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
};
