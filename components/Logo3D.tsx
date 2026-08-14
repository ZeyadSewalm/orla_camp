'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Low-poly 3D version of the OrlaDent mark.
 *
 * The geometry is built by extruding the SAME 2D facet paths the flat SVG logo
 * uses — so it is provably the brand mark in three dimensions, not a generic
 * shape. Extrusion is flat-bevelled with `curveSegments: 1`, which keeps the
 * triangle count in the low thousands rather than the tens of thousands a
 * bevelled model would cost.
 *
 * Performance rules enforced here:
 *  - pixel ratio capped at 2
 *  - the render loop is paused whenever the canvas is off-screen
 *  - on small screens: one settling rotation on load, then static
 *  - prefers-reduced-motion: no auto-rotate, no pointer tracking, static frame
 *  - the whole component is client-only and lazily imported by the hero
 */

// The mark's facets, in SVG path syntax — identical to components/Logo.tsx.
const FACETS = [
  'M24 148 L110 118 L118 168 Z',
  'M118 70 L206 100 L196 186 L112 176 L106 116 Z',
  'M112 182 L196 192 L206 246 L132 262 Z',
  'M132 268 L206 252 L214 320 L140 336 Z',
  'M138 342 L212 330 L232 392 L116 392 Z',
  'M200 200 L230 268 L214 318 L194 252 Z',
  'M214 196 L300 64 L322 92 L240 214 Z',
  'M220 230 L312 120 L328 152 L244 248 Z',
  'M228 266 L320 182 L330 214 L250 286 Z',
  'M84 398 L256 398 L256 424 L84 424 Z',
  'M98 430 L242 430 L266 482 L74 482 Z',
  'M52 488 L288 488 L288 516 L52 516 Z'
];

/** Turns "M x y L x y … Z" into a THREE.Shape. Only M/L/Z are used. */
function shapeFromPath(d: string): THREE.Shape {
  const shape = new THREE.Shape();
  const tokens = d.trim().split(/[\s,]+/);
  let i = 0;
  let started = false;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'Z' || cmd === 'z') break;

    if (cmd === 'M' || cmd === 'L') {
      const x = parseFloat(tokens[i + 1]);
      // SVG y grows downward, three.js grows upward — flip it.
      const y = -parseFloat(tokens[i + 2]);
      if (cmd === 'M' && !started) {
        shape.moveTo(x, y);
        started = true;
      } else {
        shape.lineTo(x, y);
      }
      i += 3;
    } else {
      i += 1;
    }
  }
  return shape;
}

export default function Logo3D({ className = '' }: { className?: string }) {
  const mount = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const smallScreen = window.matchMedia('(max-width: 768px)').matches;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    camera.position.set(0, 0, 780);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    // Capped at 2: beyond that the extra pixels cost real frames for no
    // visible gain on the screens people actually use.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    // ---- geometry: extrude the flat facets into slabs ----
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,     // near-black, matching --ink
      metalness: 0.65,
      roughness: 0.34,
      flatShading: true    // keeps the faceted read of the logo
    });

    for (const d of FACETS) {
      const geometry = new THREE.ExtrudeGeometry(shapeFromPath(d), {
        depth: 26,
        bevelEnabled: false,
        curveSegments: 1
      });
      group.add(new THREE.Mesh(geometry, material));
    }

    // Centre the model on its own bounding box rather than guessing.
    const box = new THREE.Box3().setFromObject(group);
    const centre = box.getCenter(new THREE.Vector3());
    group.position.sub(centre);

    const pivot = new THREE.Group();
    pivot.add(group);
    scene.add(pivot);

    // ---- lighting: white key + a brass fill for the metallic read ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-260, 320, 520);
    scene.add(key);

    const brass = new THREE.PointLight(0xb08d57, 2.4, 1600);
    brass.position.set(340, -140, 340);
    scene.add(brass);

    const rim = new THREE.DirectionalLight(0xb08d57, 0.8);
    rim.position.set(300, 120, -420);
    scene.add(rim);

    // ---- sizing ----
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // ---- interaction ----
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const interactive = !reduceMotion && !smallScreen;

    const onPointerMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      // -1..1 across the viewport, so the tilt follows the cursor everywhere
      // on the hero, not only directly over the canvas.
      target.y = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.75;
      target.x = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.5;
    };
    if (interactive) window.addEventListener('pointermove', onPointerMove, { passive: true });

    // ---- render loop, paused when off-screen ----
    let frame = 0;
    let visible = true;
    let elapsed = 0;
    const clock = new THREE.Clock();

    const visibility = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0.01 }
    );
    visibility.observe(host);

    const render = () => {
      frame = requestAnimationFrame(render);
      const delta = clock.getDelta();
      if (!visible) return;

      if (reduceMotion) {
        pivot.rotation.set(0, -0.34, 0);
      } else if (smallScreen) {
        // One settling turn on load, then it holds still — no battery drain.
        elapsed += delta;
        const t = Math.min(elapsed / 2.2, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        pivot.rotation.y = -0.34 + (1 - eased) * Math.PI * 0.9;
      } else {
        pivot.rotation.y += delta * 0.22;
        // ease toward the pointer instead of snapping
        current.x += (target.x - current.x) * 0.06;
        current.y += (target.y - current.y) * 0.06;
        pivot.rotation.x = current.x;
        group.rotation.y = current.y * 0.5;
      }

      renderer.render(scene, camera);
    };
    render();

    setReady(true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      if (interactive) window.removeEventListener('pointermove', onPointerMove);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mount}
      aria-hidden
      className={`transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}
