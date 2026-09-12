import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface Hero3DEmblemProps {
  imageSrc: string;
  altText: string;
  type: 'ndmu' | 'deped';
  globalMouse: { x: number; y: number };
}

export const Hero3DEmblem: React.FC<Hero3DEmblemProps> = ({
  imageSrc,
  altText,
  type,
  globalMouse,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Controlled mouse tilt physics (5–6 degrees maximum)
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { damping: 28, stiffness: 180, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [6, -6]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-6, 6]), springConfig);

  const isNdmu = type === 'ndmu';
  const parallaxX = isNdmu ? globalMouse.x * 10 : globalMouse.x * -10;
  const parallaxY = isNdmu ? globalMouse.y * 10 : globalMouse.y * -10;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <div
      ref={containerRef}
      className={`emblem-anchor-wrapper emblem-pos-${type}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="emblem-stage"
        animate={{
          x: parallaxX,
          y: parallaxY,
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 100 }}
        style={{
          perspective: 1200,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Soft Ambient Glow Behind Logo */}
        <div className={`emblem-soft-glow glow-${type} ${isHovered ? 'glow-active' : ''}`} />

        {/* 3D Physical Emblem Body */}
        <motion.div
          className={`emblem-artwork-body ${isHovered ? 'emblem-hovered' : ''}`}
          style={{
            rotateX,
            rotateY,
            transformStyle: 'preserve-3d',
          }}
          whileHover={{ scale: 1.035 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Under-Shadow Layer */}
          <div className="emblem-shadow-layer">
            <img src={imageSrc} alt="" className={`emblem-shadow-img ${type === 'deped' ? 'is-deped' : ''}`} />
          </div>

          {/* Front Face: Pristine Logo */}
          <div className="emblem-face-layer">
            <img
              src={imageSrc}
              alt={altText}
              className={`emblem-pure-img ${type === 'deped' ? 'is-deped' : ''}`}
              draggable={false}
            />
          </div>

          {/* Subtle Specular Rim Glare */}
          <div
            className="emblem-specular-sheen"
            style={{
              opacity: isHovered ? 0.6 : 0,
              background: 'radial-gradient(circle 160px at 50% 50%, rgba(255, 255, 255, 0.35) 0%, transparent 65%)',
              transition: 'opacity 0.2s ease',
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};
