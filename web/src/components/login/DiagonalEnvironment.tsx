import React, { useRef, useEffect } from 'react';

interface DiagonalEnvironmentProps {
  mousePos?: { x: number; y: number };
}

export const DiagonalEnvironment: React.FC<DiagonalEnvironmentProps> = ({ mousePos }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolNdmuRef = useRef<HTMLDivElement>(null);
  const poolDepedRef = useRef<HTMLDivElement>(null);

  // Parallax on ambient pools without re-rendering parent tree
  useEffect(() => {
    if (mousePos) {
      if (poolNdmuRef.current) {
        poolNdmuRef.current.style.transform = `translate(${mousePos.x * 12}px, ${mousePos.y * 12}px)`;
      }
      if (poolDepedRef.current) {
        poolDepedRef.current.style.transform = `translate(${mousePos.x * -12}px, ${mousePos.y * -12}px)`;
      }
      return;
    }

    let ticking = false;
    const handleMouseMove = (e: MouseEvent) => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const normX = (e.clientX / window.innerWidth) * 2 - 1;
        const normY = (e.clientY / window.innerHeight) * 2 - 1;

        if (poolNdmuRef.current) {
          poolNdmuRef.current.style.transform = `translate(${normX * 12}px, ${normY * 12}px)`;
        }
        if (poolDepedRef.current) {
          poolDepedRef.current.style.transform = `translate(${normX * -12}px, ${normY * -12}px)`;
        }
        ticking = false;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [mousePos]);

  // Slow-drifting atmospheric particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    const nodeCount = 22;
    const nodes = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.6 + 0.8,
      alpha: Math.random() * 0.3 + 0.1,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodeCount; i++) {
        const n1 = nodes[i];
        n1.x += n1.vx;
        n1.y += n1.vy;
        if (n1.x < 0) n1.x = width;
        if (n1.x > width) n1.x = 0;
        if (n1.y < 0) n1.y = height;
        if (n1.y > height) n1.y = 0;

        ctx.fillStyle = `rgba(147, 197, 253, ${n1.alpha})`;
        ctx.beginPath();
        ctx.arc(n1.x, n1.y, n1.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < nodeCount; j++) {
          const n2 = nodes[j];
          const dist = Math.hypot(n1.x - n2.x, n1.y - n2.y);
          if (dist < 90) {
            ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - dist / 90) * 0.08})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="nexus-environment-root">
      {/* ─── 1. Continuous Midnight Navy Environment ───────────────── */}
      <div className="nexus-base-gradient" />
      <div className="nexus-grid-mesh" />

      {/* Volumetric Radial Light Pools */}
      <div
        ref={poolNdmuRef}
        className="nexus-ambient-pool pool-ndmu"
      />
      <div
        ref={poolDepedRef}
        className="nexus-ambient-pool pool-deped"
      />
      <div className="nexus-ambient-center-glow" />

      {/* Sparse Atmospheric Particles */}
      <canvas ref={canvasRef} className="nexus-particles-canvas" />
    </div>
  );
};
