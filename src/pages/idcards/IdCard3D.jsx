/**
 * An ID card you can pick up (Oct 2026).
 *
 * The card is a real 3D object in CSS: two faces (IdCardFace) back to back
 * with the PVC's thickness between them, a light sheen and a holographic seal
 * that catch the light as it turns, and a shadow under it. With `lanyard` it
 * hangs from a woven school strap and swivel clip, drops in on arrival and
 * swings to rest like a pendulum.
 *
 *   move the pointer over it      it tilts towards you
 *   drag sideways                 it spins, with momentum, and settles face-on
 *   click / tap / Enter / Space   it flips over
 *
 * A small spring simulation drives it — one requestAnimationFrame loop per
 * card, writing transforms straight to the DOM (no re-render per frame), and
 * paused while the card is off screen or at rest. Reduced motion turns off
 * the drop, the idle drift, the swing and the tilt; flipping stays, quick.
 */
import React, { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import IdCardFace, { shade } from './IdCardFace';

const RATIO = 85.6 / 53.98;

function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * The strap the card hangs from, with the school's name woven into it, and
 * the swivel clip whose hook goes through the card's slot. Laid out in the
 * sway group's pixels: the card's top edge is at y = strap.
 */
function Lanyard({ card, strap, width, w, landscape }) {
  const look = card.design || {};
  const name = String(look.identity?.name || 'School').toUpperCase();
  const words = Array.from({ length: 8 }, () => name).join('   •   ');
  const clipW = Math.round(width * 0.2);
  const clipH = Math.round(clipW * (92 / 60));
  const slotY = (landscape ? 0.026 : 0.063) * w;          // the slot's middle, below the card's top
  const clipTop = Math.round(strap + slotY - clipH * (70 / 92));
  const sw = Math.round(clipW * (34 / 60));
  const strapTop = -Math.round(strap * 1.6 + 40);
  return (
    <div className="ic3d-lanyard" aria-hidden="true"
      style={{ '--lp': look.primary, '--la': look.accent, '--lp-dark': shade(look.primary, -0.4), '--lp-hi': shade(look.primary, 0.18) }}>
      <div className="ic3d-strap" style={{ width: sw, top: strapTop, height: clipTop - strapTop + clipH * 0.14, marginLeft: -sw / 2 }}>
        <span className="ic3d-strap__words" style={{ fontSize: Math.max(7, Math.round(sw * 0.36)) }}>{words}</span>
      </div>
      <svg className="ic3d-clip" viewBox="0 0 60 92" width={clipW} height={clipH} style={{ top: clipTop, marginLeft: -clipW / 2 }}>
        <defs>
          <linearGradient id="ic3dMetal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a929e" /><stop offset=".28" stopColor="#f4f6f9" />
            <stop offset=".55" stopColor="#b9c0cb" /><stop offset=".8" stopColor="#eef1f5" /><stop offset="1" stopColor="#7d8591" />
          </linearGradient>
          <linearGradient id="ic3dMetalV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef1f5" /><stop offset="1" stopColor="#9aa2ad" />
          </linearGradient>
        </defs>
        {/* Crimp that holds the strap's loop. */}
        <rect x="13" y="2" width="34" height="20" rx="5" fill="url(#ic3dMetal)" stroke="#6b7280" strokeWidth=".8" />
        <rect x="17" y="7" width="26" height="2" rx="1" fill="#ffffff" opacity=".75" />
        <rect x="17" y="14" width="26" height="1.4" rx=".7" fill="#000000" opacity=".12" />
        {/* Swivel. */}
        <rect x="25" y="22" width="10" height="9" rx="2" fill="url(#ic3dMetalV)" stroke="#6b7280" strokeWidth=".7" />
        <circle cx="30" cy="36" r="6" fill="none" stroke="url(#ic3dMetal)" strokeWidth="4" />
        {/* The hook, down through the card's slot. */}
        <path d="M30 42 V60 C30 72 46 72 46 60 V55" fill="none" stroke="url(#ic3dMetal)" strokeWidth="4.6" strokeLinecap="round" />
        <path d="M30 42 V60 C30 72 46 72 46 60 V55" fill="none" stroke="#5b636e" strokeWidth=".7" strokeLinecap="round" opacity=".55" />
      </svg>
    </div>
  );
}

/**
 * props:
 *   card          a card view (see services/idCardViews.cardView)
 *   width         the card's width on screen, in px (a landscape card is drawn wider)
 *   lanyard       hang it from a strap
 *   flipped       show the back (controlled); onFlip(isBack) reports changes
 *   entrance      drop in on mount
 *   idle          drift gently while nobody touches it
 *   stamp         stamp a card that is not in force
 */
const IdCard3D = forwardRef(function IdCard3D({
  card, width = 300, lanyard = false, flipped, onFlip, entrance = true, idle = true, stamp = true,
  interactive = true, label, className = '', hint = false,
}, ref) {
  const landscape = card?.design?.layout === 'landscape';
  const w = landscape ? Math.round(width * 1.32) : width;
  const h = Math.round(landscape ? w / RATIO : w * RATIO);
  const strap = lanyard ? Math.round(Math.max(70, width * 0.42)) : 0;
  const t = Math.max(3, Math.round(w * 0.012));

  const stageRef = useRef(null);
  const swayRef = useRef(null);
  const cardRef = useRef(null);
  const shadowRef = useRef(null);
  const hintRef = useRef(null);
  const sim = useRef(null);
  const raf = useRef(0);
  const visible = useRef(true);
  const reduced = useRef(prefersReduced());
  const onFlipRef = useRef(onFlip);
  onFlipRef.current = onFlip;

  if (!sim.current) {
    const r = reduced.current;
    sim.current = {
      ry: r || !entrance ? 0 : -38, vy: 0,
      rx: 0, vx: 0,
      sw: r || !entrance || !lanyard ? 0 : 9, vsw: 0,
      dy: r || !entrance ? 0 : -1, vdy: 0,
      base: flipped ? 180 : 0,
      ptr: null, drag: null, time: 0, last: 0, touched: false,
    };
  }

  const step = useCallback((now) => {
    const s = sim.current;
    const r = reduced.current;
    const dt = Math.min(1 / 30, s.last ? (now - s.last) / 1000 : 1 / 60);
    s.last = now;
    s.time += dt;

    const drifting = idle && !r && !s.ptr && !s.drag && visible.current;
    const ryT = s.base + (s.ptr && !r ? s.ptr.x * 24 : drifting ? 8 * Math.sin(s.time * 0.55) : 0);
    const rxT = s.ptr && !r ? -s.ptr.y * 16 : drifting ? 3 * Math.sin(s.time * 0.41 + 1.1) : 0;

    const k = r ? 420 : 46; const c = r ? 42 : 9.5;
    if (!s.drag) {
      s.vy += (-k * (s.ry - ryT) - c * s.vy) * dt;
      s.ry += s.vy * dt;
    }
    if (!s.drag || r) {
      s.vx += (-(r ? 420 : 70) * (s.rx - rxT) - (r ? 42 : 13) * s.vx) * dt;
      s.rx += s.vx * dt;
    }
    if (lanyard && !r) {
      // A pendulum: pulled back to rest, a little friction, nudged by spins.
      s.vsw += (-24 * s.sw - 1.25 * s.vsw) * dt;
      s.sw += s.vsw * dt;
    } else { s.sw = 0; s.vsw = 0; }
    if (!r) {
      s.vdy += (-36 * s.dy - 7.6 * s.vdy) * dt;
      s.dy += s.vdy * dt;
    } else { s.dy = 0; }

    // Write it out.
    const sway = swayRef.current; const el = cardRef.current;
    if (sway) sway.style.transform = `translate3d(0, ${(s.dy * (h + strap + 40)).toFixed(2)}px, 0) rotate(${s.sw.toFixed(3)}deg)`;
    if (el) {
      el.style.transform = `rotateX(${s.rx.toFixed(3)}deg) rotateY(${s.ry.toFixed(3)}deg)`;
      const rad = (s.ry * Math.PI) / 180;
      el.style.setProperty('--sx', `${(50 + Math.sin(rad) * 70 + s.rx * 1.2).toFixed(2)}%`);
      el.style.setProperty('--sy', `${(50 - s.rx * 2.2).toFixed(2)}%`);
      el.style.setProperty('--so', (0.18 + Math.min(1, Math.abs(Math.sin(rad)) * 1.6 + Math.abs(s.rx) / 24) * 0.62).toFixed(3));
      el.style.setProperty('--hue', `${(s.ry * 2.2 + s.rx * 6).toFixed(1)}deg`);
    }
    if (shadowRef.current) {
      const lean = lanyard ? Math.sin((s.sw * Math.PI) / 180) * (strap + h * 0.9) : 0;
      const sx = 0.52 + 0.48 * Math.abs(Math.cos((s.ry * Math.PI) / 180));
      shadowRef.current.style.transform = `translateX(${lean.toFixed(1)}px) scale(${sx.toFixed(3)}, 1)`;
      shadowRef.current.style.opacity = (Math.max(0, 1 + s.dy * 1.6) * (0.85 - Math.abs(s.rx) / 80)).toFixed(3);
    }

    const settled = Math.abs(s.ry - ryT) < 0.02 && Math.abs(s.vy) < 0.02 && Math.abs(s.rx - rxT) < 0.02 && Math.abs(s.vx) < 0.02
      && Math.abs(s.sw) < 0.01 && Math.abs(s.vsw) < 0.01 && Math.abs(s.dy) < 0.0005 && Math.abs(s.vdy) < 0.0005;
    if (!visible.current || (settled && !drifting && !s.drag)) { raf.current = 0; s.last = 0; return; }
    raf.current = requestAnimationFrame(step);
  }, [h, idle, lanyard, strap]);

  const wake = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(step);
  }, [step]);

  useEffect(() => {
    wake();
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting) wake();
    }) : null;
    if (io && stageRef.current) io.observe(stageRef.current);
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMq = () => { reduced.current = mq.matches; wake(); };
    mq?.addEventListener?.('change', onMq);
    return () => {
      cancelAnimationFrame(raf.current); raf.current = 0;
      io?.disconnect();
      mq?.removeEventListener?.('change', onMq);
    };
  }, [wake]);

  const isBack = () => Math.round(sim.current.base / 180) % 2 !== 0;
  const flip = useCallback((dir = 1) => {
    const s = sim.current;
    s.base += 180 * dir;
    if (lanyard && !reduced.current) s.vsw += 14 * dir;
    s.touched = true;
    if (hintRef.current) hintRef.current.classList.add('is-gone');
    onFlipRef.current?.(Math.round(s.base / 180) % 2 !== 0);
    wake();
  }, [lanyard, wake]);

  useImperativeHandle(ref, () => ({ flip, isBack }), [flip]);

  // A controlled `flipped` follows the parent.
  useEffect(() => {
    if (flipped === undefined) return;
    if (flipped !== isBack()) flip(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped]);

  /* ── Pointer ─────────────────────────────────────────────────────────── */

  const onPointerMove = (e) => {
    const s = sim.current;
    if (!interactive) return;
    if (s.drag) {
      const dx = e.clientX - s.drag.x0;
      const dy = e.clientY - s.drag.y0;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) s.drag.moved = true;
      const now = performance.now();
      const ry = s.drag.ry0 + dx * 0.55;
      const inst = ((ry - s.ry) / Math.max(1, now - s.drag.lt)) * 1000;
      s.drag.vel = s.drag.vel * 0.6 + inst * 0.4;
      s.drag.lt = now;
      s.ry = ry;
      s.rx = Math.max(-24, Math.min(24, s.drag.rx0 - dy * 0.22));
      s.vx = 0;
      if (lanyard && !reduced.current) s.vsw += (e.movementX || 0) * 0.05;
      wake();
      return;
    }
    if (reduced.current) return;
    const b = cardRef.current?.getBoundingClientRect();
    if (!b) return;
    s.ptr = { x: Math.max(-0.6, Math.min(0.6, (e.clientX - (b.left + b.width / 2)) / b.width)), y: Math.max(-0.6, Math.min(0.6, (e.clientY - (b.top + b.height / 2)) / b.height)) };
    if (lanyard) s.vsw += (e.movementX || 0) * 0.012;
    wake();
  };
  const onPointerLeave = () => { sim.current.ptr = null; wake(); };
  const onPointerDown = (e) => {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const s = sim.current;
    s.drag = { x0: e.clientX, y0: e.clientY, ry0: s.ry, rx0: s.rx, moved: false, vel: 0, lt: performance.now() };
    s.vy = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const onPointerUp = (e) => {
    const s = sim.current;
    const d = s.drag;
    if (!d) return;
    s.drag = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (!d.moved) { flip(1); return; }
    // Settle on whichever face the spin carries it to.
    const projected = s.ry + d.vel * 0.22;
    const before = isBack();
    s.base = Math.round(projected / 180) * 180;
    s.vy = d.vel;
    s.touched = true;
    if (hintRef.current) hintRef.current.classList.add('is-gone');
    if (before !== isBack()) onFlipRef.current?.(isBack());
    wake();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); flip(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); flip(1); }
  };

  if (!card) return null;
  const n = 8;
  return (
    <div
      ref={stageRef}
      className={`ic3d${lanyard ? ' ic3d--lanyard' : ''}${landscape ? ' ic3d--landscape' : ''} ${className}`}
      style={{ '--w': `${w}px`, '--h': `${h}px`, '--t': `${t}px`, '--strap': `${strap}px` }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="ic3d-sway" ref={swayRef}>
        {lanyard ? <Lanyard card={card} strap={strap} width={width} w={w} landscape={landscape} /> : null}
        <div
          className="ic3d-card"
          ref={cardRef}
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={label || `${card.snapshot?.name || 'ID'} card — press Enter to turn it over`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div className="ic3d-face ic3d-face--front">
            <IdCardFace card={card} side="front" stamp={stamp} />
            <i className={`ic3d-holo${card.design?.photoShape === 'circle' ? ' ic3d-holo--circle' : ''}`} aria-hidden="true" />
            <i className="ic3d-sheen" aria-hidden="true" />
          </div>
          <div className="ic3d-face ic3d-face--back">
            <IdCardFace card={card} side="back" stamp={stamp} />
            <i className="ic3d-sheen" aria-hidden="true" />
          </div>
          {Array.from({ length: n }, (_, i) => (
            // The slot is masked on an inner element: Chrome ignores a mask on
            // the element that carries the 3D transform itself.
            <i key={i} className={`ic3d-edge${landscape ? ' ic3d-edge--l' : ''}`} style={{ transform: `translateZ(${(-t / 2 + (t * (i + 0.5)) / n).toFixed(2)}px)` }} aria-hidden="true"><b /></i>
          ))}
        </div>
      </div>
      <div className="ic3d-shadow" ref={shadowRef} aria-hidden="true" />
      {hint && interactive ? <div className="ic3d-hint" ref={hintRef}>Drag to turn · click to flip</div> : null}
    </div>
  );
});

export default IdCard3D;
