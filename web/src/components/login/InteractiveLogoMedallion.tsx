import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface InteractiveLogoMedallionProps {
  logoSrc: string;
  logoAlt: string;
  institutionName: string;
  badgeLabel: string;
  description: string;
  position: 'top-left' | 'bottom-right';
  theme: 'ndmu' | 'deped';
}

export const InteractiveLogoMedallion: React.FC<InteractiveLogoMedallionProps> = ({
  logoSrc,
  logoAlt,
  institutionName,
  badgeLabel,
  description,
  position,
  theme,
}) => {
  const medallionRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mouse tilt motion values
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { damping: 22, stiffness: 240, mass: 0.4 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [14, -14]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-14, 14]), springConfig);
  const glareX = useTransform(mouseX, [0, 1], ['0%', '100%']);
  const glareY = useTransform(mouseY, [0, 1], ['0%', '100%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!medallionRef.current) return;
    const rect = medallionRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  const isTopLeft = position === 'top-left';

  return (
    <div className={`corner-showcase-container showcase-${position}`}>
      {/* ─── TOP-LEFT: Official NDMU Logo + Details Below ───────────────── */}
      {isTopLeft ? (
        <div className="corner-showcase-layout layout-top-left">
          {/* 3D Floating Official Logo */}
          <motion.div
            ref={medallionRef}
            className="official-logo-3d-box"
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.2 },
              scale: { duration: 0.8, delay: 0.2 },
              y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
          >
            <motion.div
              className={`official-ndmu-element ${isHovered ? 'logo-hovered' : ''}`}
              style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.97 }}
            >
              {/* Soft Ambient Light Halo */}
              <div className="official-ambient-glow glow-ndmu" />

              {/* Exact Official Unaltered NDMU Logo */}
              <img
                src={logoSrc}
                alt={logoAlt}
                className="official-ndmu-img"
                draggable={false}
              />

              {/* Dynamic 3D Glare Reflection */}
              <motion.div
                className="official-glare-overlay"
                style={{
                  background: isHovered
                    ? `radial-gradient(circle 180px at ${glareX.get()} ${glareY.get()}, rgba(255, 255, 255, 0.4) 0%, transparent 70%)`
                    : 'none',
                }}
              />
            </motion.div>
          </motion.div>

          {/* Text Description Block */}
          <motion.div
            className="corner-info-block info-ndmu"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="corner-pill-badge pill-ndmu-light">
              <span className="pill-dot-blue" />
              <span>{badgeLabel}</span>
            </div>

            <h3 className="corner-title-text text-navy">{institutionName}</h3>

            <p className="corner-desc-text text-slate">{description}</p>
          </motion.div>
        </div>
      ) : (
        /* ─── BOTTOM-RIGHT: Text Above + Official DepEd Medallion Below ─── */
        <div className="corner-showcase-layout layout-bottom-right">
          {/* Text Description Block */}
          <motion.div
            className="corner-info-block info-deped"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="corner-pill-badge pill-deped-dark">
              <span className="pill-dot-cyan" />
              <span>{badgeLabel}</span>
            </div>

            <h3 className="corner-title-text text-white">{institutionName}</h3>

            <p className="corner-desc-text text-light-slate">{description}</p>
          </motion.div>

          {/* 3D Floating Official DepEd Medallion */}
          <motion.div
            ref={medallionRef}
            className="official-logo-3d-box"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: [0, 6, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.3 },
              scale: { duration: 0.8, delay: 0.3 },
              y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 3 },
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
          >
            <motion.div
              className={`official-deped-element ${isHovered ? 'logo-hovered' : ''}`}
              style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.97 }}
            >
              {/* Outer Cyan Electric Glow */}
              <div className="official-ambient-glow glow-deped" />

              {/* 3D Beveled Metallic Border Ring Housing the Official Logo */}
              <div className="deped-metallic-ring-housing">
                {/* Exact Official Unaltered DepEd Region XII Logo */}
                <img
                  src={logoSrc}
                  alt={logoAlt}
                  className="official-deped-img"
                  draggable={false}
                />
              </div>

              {/* Dynamic 3D Glare Reflection */}
              <motion.div
                className="official-glare-overlay"
                style={{
                  background: isHovered
                    ? `radial-gradient(circle 200px at ${glareX.get()} ${glareY.get()}, rgba(255, 255, 255, 0.45) 0%, transparent 70%)`
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, transparent 60%)',
                }}
              />
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
