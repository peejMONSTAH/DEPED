import { useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/** Decorative motion stays outside React's form-render cycle. */
export const LoginGlow = () => {
  const reduceMotion = useReducedMotion();
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, { stiffness: 58, damping: 20, mass: 0.9 });
  const y = useSpring(targetY, { stiffness: 58, damping: 20, mass: 0.9 });

  useEffect(() => {
    const pointerPreference = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reset = () => { targetX.set(0); targetY.set(0); };
    const move = (event: PointerEvent) => {
      if (reduceMotion || !pointerPreference.matches || event.pointerType === 'touch') return;
      targetX.set((event.clientX / window.innerWidth - 0.5) * 300);
      targetY.set((event.clientY / window.innerHeight - 0.5) * 210);
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    pointerPreference.addEventListener('change', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      pointerPreference.removeEventListener('change', reset);
    };
  }, [reduceMotion, targetX, targetY]);

  return (
    <div className="login-glow-layer" aria-hidden="true">
      <motion.div className="login-glow-tracker" style={{ x, y }}>
        <div className="login-glow-cloud login-glow-cloud-left" />
        <div className="login-glow-cloud login-glow-cloud-right" />
      </motion.div>
    </div>
  );
};
