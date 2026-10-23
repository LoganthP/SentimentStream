import { useEffect, useRef, useState } from "react";
import { useAppState } from "../../lib/AppState";

// Colors derived strictly from existing design tokens
const COLORS = {
  raw: "rgba(182, 176, 216, 0.75)",
  pos: "#2ee5a9", // var(--color-pos) in dark
  neu: "#8897ff", // var(--color-neu) in dark
  neg: "#ff6b93", // var(--color-neg) in dark
  lane: "rgba(136, 151, 255, 0.15)",
  engineBorder: "rgba(255, 255, 255, 0.12)",
};

const SAMPLE_POSTS = [
  { text: "Camera quality is amazing!", sent: "pos" },
  { text: "Battery drains after update", sent: "neg" },
  { text: "Screen is decent for the price", sent: "neu" },
  { text: "Blazing fast performance", sent: "pos" },
  { text: "Overheating while charging", sent: "neg" },
  { text: "Arrived in 2 days, standard box", sent: "neu" },
];

export default function StreamCanvas({ className = "" }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { isDark } = useAppState();
  const [stats, setStats] = useState({ processed: 124800, posRate: 64, neuRate: 22, negRate: 14 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId;
    let isVisible = true;
    let isTabActive = true;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Responsive dimensions
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = Math.max(340, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Particle pool
    const isMobile = () => width < 640;
    const maxParticles = prefersReducedMotion ? 20 : isMobile() ? 22 : 48;
    const particles = [];

    const createParticle = (spawnX = 0) => {
      const sample = SAMPLE_POSTS[Math.floor(Math.random() * SAMPLE_POSTS.length)];
      const laneCount = isMobile() ? 2 : 4;
      const lane = Math.floor(Math.random() * laneCount);
      return {
        x: spawnX,
        y: Math.random() * height,
        lane,
        speed: prefersReducedMotion ? 0 : 1.2 + Math.random() * 1.4,
        size: 3 + Math.random() * 2.5,
        text: Math.random() < 0.25 ? sample.text : null,
        sentiment: sample.sent,
        state: "raw", // 'raw' -> 'processing' -> 'insight'
        pulse: 0,
        alpha: 0.1,
      };
    };

    for (let i = 0; i < maxParticles; i++) {
      particles.push(createParticle(Math.random() * width));
    }

    // Sparkline live point history for right zone
    const trendPoints = [30, 32, 28, 35, 42, 38, 45, 52, 48, 55, 60, 58, 64];

    // Intersection & Visibility Observers to pause RAF
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(canvas);

    const onVisibilityChange = () => {
      isTabActive = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let frameCount = 0;

    const render = () => {
      if (!isVisible || !isTabActive) {
        if (!prefersReducedMotion) animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const isMob = isMobile();
      const laneCount = isMob ? 2 : 4;

      // Zones definition
      const zone1End = isMob ? width * 0.22 : width * 0.26;
      const zone2End = isMob ? width * 0.68 : width * 0.66;
      const engineTop = 40;
      const engineBottom = height - 40;
      const engineHeight = engineBottom - engineTop;
      const laneHeight = engineHeight / laneCount;

      // Draw Engine Container (Zone 2)
      ctx.save();
      ctx.fillStyle = isDark ? "rgba(24, 20, 48, 0.35)" : "rgba(255, 255, 255, 0.30)";
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(110, 90, 180, 0.18)";
      ctx.lineWidth = 1;

      // Engine frame
      const engineX = zone1End;
      const engineW = zone2End - zone1End;
      ctx.beginPath();
      ctx.roundRect(engineX, engineTop - 12, engineW, engineHeight + 24, 20);
      ctx.fill();
      ctx.stroke();

      // Engine Header Label
      ctx.font = '600 11px "Figtree", sans-serif';
      ctx.fillStyle = isDark ? "#8897ff" : "#5465e6";
      ctx.fillText("SPARK PARTITIONS · 4 LANES", engineX + 16, engineTop + 4);

      ctx.font = '500 10px "Figtree", sans-serif';
      ctx.fillStyle = isDark ? "rgba(182, 176, 216, 0.7)" : "rgba(102, 94, 143, 0.8)";
      ctx.fillText("Vectorised MLlib UDF", engineX + engineW - 120, engineTop + 4);

      // Lane dividers
      for (let i = 0; i < laneCount; i++) {
        const laneY = engineTop + i * laneHeight;
        ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(110, 90, 180, 0.1)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(engineX + 10, laneY);
        ctx.lineTo(engineX + engineW - 10, laneY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Lane label
        ctx.font = '600 9px monospace';
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.25)" : "rgba(30, 23, 66, 0.3)";
        ctx.fillText(`P${i}`, engineX + 8, laneY + laneHeight / 2 + 3);
      }
      ctx.restore();

      // Draw Zone 3: Insights Panel (Right side)
      const insightX = zone2End + 14;
      const insightW = width - insightX - 10;
      if (insightW > 90) {
        ctx.save();
        ctx.font = '700 11px "Bricolage Grotesque", sans-serif';
        ctx.fillStyle = isDark ? "#f2efff" : "#1e1742";
        ctx.fillText("LIVE INSIGHTS", insightX, engineTop + 4);

        // Sentiment breakdown bars
        const barY = engineTop + 24;
        const barH = 7;
        const totalW = Math.min(insightW, 140);

        // Positive
        ctx.fillStyle = COLORS.pos;
        ctx.fillRect(insightX, barY, totalW * 0.64, barH);
        // Neutral
        ctx.fillStyle = COLORS.neu;
        ctx.fillRect(insightX + totalW * 0.64, barY, totalW * 0.22, barH);
        // Negative
        ctx.fillStyle = COLORS.neg;
        ctx.fillRect(insightX + totalW * 0.86, barY, totalW * 0.14, barH);

        // Bar labels
        ctx.font = '600 9px "Figtree", sans-serif';
        ctx.fillStyle = COLORS.pos;
        ctx.fillText("64% POS", insightX, barY + barH + 12);
        ctx.fillStyle = COLORS.neu;
        ctx.fillText("22%", insightX + totalW * 0.52, barY + barH + 12);
        ctx.fillStyle = COLORS.neg;
        ctx.fillText("14% NEG", insightX + totalW - 42, barY + barH + 12);

        // Mini Sparkline
        const sparkTop = barY + 36;
        const sparkH = 46;
        ctx.strokeStyle = COLORS.pos;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = totalW / (trendPoints.length - 1);
        trendPoints.forEach((val, idx) => {
          const px = insightX + idx * step;
          const py = sparkTop + sparkH - (val / 100) * sparkH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // Area under sparkline
        ctx.lineTo(insightX + totalW, sparkTop + sparkH);
        ctx.lineTo(insightX, sparkTop + sparkH);
        ctx.closePath();
        ctx.fillStyle = isDark ? "rgba(46, 229, 169, 0.08)" : "rgba(14, 158, 114, 0.10)";
        ctx.fill();

        ctx.font = '600 9px "Figtree", sans-serif';
        ctx.fillStyle = isDark ? "#b6b0d8" : "#483f72";
        ctx.fillText("Net sentiment +50", insightX, sparkTop + sparkH + 14);

        ctx.restore();
      }

      // Update & Draw Particles
      particles.forEach((p) => {
        if (!prefersReducedMotion) {
          p.x += p.speed;
        }

        // Zone 1: Ingestion
        if (p.x < zone1End) {
          p.state = "raw";
          p.alpha = Math.min(0.85, p.alpha + 0.04);
          // Gentle vertical bobbing
          p.y += Math.sin(p.x * 0.04 + p.lane) * 0.5;
        }
        // Zone 2: Spark Engine
        else if (p.x >= zone1End && p.x < zone2End) {
          p.state = "processing";
          // Smoothly attract particle to center of its assigned lane
          const targetY = engineTop + p.lane * laneHeight + laneHeight / 2;
          p.y += (targetY - p.y) * 0.08;

          // Pulse flash in middle of lane
          const midZone = zone1End + (zone2End - zone1End) * 0.45;
          if (Math.abs(p.x - midZone) < 15 && p.pulse === 0) {
            p.pulse = 1;
          }
          if (p.pulse > 0) {
            p.pulse = Math.max(0, p.pulse - 0.04);
          }
        }
        // Zone 3: Insight Resolution
        else {
          p.state = "insight";
          // Funnel gently toward the live chart area
          const targetY = engineTop + 45 + (p.sentiment === "pos" ? 0 : p.sentiment === "neu" ? 25 : 50);
          p.y += (targetY - p.y) * 0.05;
          p.alpha = Math.max(0, p.alpha - 0.025);
        }

        // Particle Respawn
        if (p.x > width + 10 || p.alpha <= 0) {
          Object.assign(p, createParticle(-10));
        }

        // Color selection
        let col = COLORS.raw;
        if (p.state === "processing" || p.state === "insight") {
          col = p.sentiment === "pos" ? COLORS.pos : p.sentiment === "neg" ? COLORS.neg : COLORS.neu;
        }

        // Draw particle glow
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = p.pulse > 0 ? 16 : 8;

        ctx.beginPath();
        const r = p.pulse > 0 ? p.size * (1 + p.pulse * 1.5) : p.size;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Optional post text snippet (on desktop, raw zone)
        if (p.text && !isMob && p.x > 15 && p.x < zone1End - 20) {
          ctx.font = '500 10px "Figtree", sans-serif';
          ctx.fillStyle = isDark ? "rgba(242, 239, 255, 0.75)" : "rgba(30, 23, 66, 0.75)";
          ctx.shadowBlur = 0;
          ctx.fillText(`“${p.text.slice(0, 22)}…”`, p.x + 8, p.y - 4);
        }
        ctx.restore();
      });

      // Frame stats tick
      frameCount++;
      if (frameCount % 60 === 0 && !prefersReducedMotion) {
        setStats((prev) => ({
          processed: prev.processed + Math.floor(Math.random() * 32 + 18),
          posRate: 64 + Math.floor(Math.sin(frameCount * 0.01) * 3),
          neuRate: 22,
          negRate: 14,
        }));
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    if (prefersReducedMotion) {
      render();
    } else {
      animId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isDark]);

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden rounded-4xl glass p-3 sm:p-5 ${className}`}>
      {/* Top Legend Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-2 text-xs font-semibold">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full animate-ping bg-pos" />
          <span className="font-display font-bold text-ink">Live Spark Pipeline</span>
          <span className="hidden text-ink-mute sm:inline">· Ingestion → MLlib → Aggregation</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-ink-mute">
          <span>{stats.processed.toLocaleString()} records scored</span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden text-pos font-semibold sm:inline">99.8% purity</span>
        </div>
      </div>

      {/* Main Stream Canvas */}
      <div className="relative h-[320px] sm:h-[360px] w-full">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Bottom Stream Indicator Labels */}
      <div className="mt-2 grid grid-cols-3 gap-2 px-2 text-center text-[11px] font-semibold text-ink-mute">
        <div className="text-left">1. Raw Multi-Format Posts</div>
        <div>2. Partitioned Worker Lanes</div>
        <div className="text-right">3. Real-Time Insights</div>
      </div>
    </div>
  );
}
