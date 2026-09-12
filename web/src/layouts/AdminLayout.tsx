import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '../components/admin/Sidebar';
import { ToastContainer } from '../components/shared/ToastContainer';
import { QuickRoleSwitcher } from '../components/common/QuickRoleSwitcher';
import { AppIcon } from '../components/common/AppIcon';

import type { Variants } from 'framer-motion';

const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1] as const,
    },
    transitionEnd: {
      transform: 'none',
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: {
      duration: 0.18,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const currentOutlet = useOutlet();
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Smoothly reset scroll position to top whenever navigating to a new admin route
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

        {/* Light / Glassmorphic Workspace Area */}
        <div className="app-workspace-area" ref={workspaceRef}>
          {/* Mobile Admin Topbar */}
          <div className="mobile-admin-topbar">
            <button
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-trigger"
            >
              <AppIcon name="menu" size={20} />
            </button>
            <span className="mobile-app-title">Eminence HRMIS</span>
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
      <QuickRoleSwitcher />
    </div>
  );
};

