import * as THREE from 'three';
import { mulberry32 } from '../core/PRNG';

type DrawFn = (ctx: CanvasRenderingContext2D, size: number) => void;

function makeTexture(size: number, draw: DrawFn, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function bambooTexture(): THREE.CanvasTexture {
  const rng = mulberry32(71);
  return makeTexture(
    256,
    (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, '#8f7c3f');
      g.addColorStop(0.22, '#c6b06a');
      g.addColorStop(0.55, '#b39b54');
      g.addColorStop(0.82, '#8a7538');
      g.addColorStop(1, '#a68d4b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);

      for (let i = 0; i < 150; i++) {
        const x = rng() * s;
        ctx.strokeStyle = `rgba(${70 + rng() * 50}, ${55 + rng() * 40}, ${25 + rng() * 25}, ${0.04 + rng() * 0.1})`;
        ctx.lineWidth = 0.4 + rng() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + rng() * 10, s * 0.33, x - rng() * 10, s * 0.66, x + rng() * 6, s);
        ctx.stroke();
      }

      for (let y = 16; y < s; y += 64) {
        ctx.fillStyle = 'rgba(62,48,20,0.34)';
        ctx.fillRect(0, y, s, 3);
        ctx.fillStyle = 'rgba(245,225,160,0.16)';
        ctx.fillRect(0, y + 3, s, 1.5);
        ctx.fillStyle = 'rgba(62,48,20,0.2)';
        ctx.fillRect(0, y + 5, s, 1);
      }
    },
    1,
    2.5,
  );
}

export function strawTexture(): THREE.CanvasTexture {
  const rng = mulberry32(23);
  return makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#c2a563';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(120,94,40,0.34)';
      ctx.lineWidth = 1;
      for (let y = 6; y < s; y += 9) {
        for (let x = 0; x < s; x += 11) {
          const off = (Math.floor(y / 9) % 2) * 5;
          ctx.beginPath();
          ctx.moveTo(x + off, y);
          ctx.lineTo(x + off + 7, y + 2.5);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(235,215,150,0.35)';
      for (let x = 0; x < s; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 3, s);
        ctx.stroke();
      }
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(90,70,30,${0.05 + rng() * 0.08})`;
        ctx.fillRect(rng() * s, rng() * s, 1 + rng() * 3, 1 + rng() * 2);
      }
    },
    2,
    2,
  );
}

export function fabricTexture(): THREE.CanvasTexture {
  const rng = mulberry32(91);
  return makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#efe6cf';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(190,178,150,0.2)';
      ctx.lineWidth = 0.6;
      for (let i = 0; i < s; i += 3) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
      }
      for (let i = 0; i < 240; i++) {
        ctx.fillStyle = `rgba(${160 + rng() * 50}, ${150 + rng() * 45}, ${125 + rng() * 40}, ${0.03 + rng() * 0.06})`;
        ctx.beginPath();
        ctx.arc(rng() * s, rng() * s, 0.5 + rng() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    2,
    2,
  );
}

export function leatherTexture(): THREE.CanvasTexture {
  const rng = mulberry32(44);
  return makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#6f4b2e';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 800; i++) {
        ctx.fillStyle = `rgba(${30 + rng() * 50}, ${20 + rng() * 35}, ${10 + rng() * 20}, ${0.04 + rng() * 0.12})`;
        ctx.beginPath();
        ctx.arc(rng() * s, rng() * s, 0.4 + rng() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(30,20,10,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const x = rng() * s;
        const y = rng() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 30, y + 6, x + 40, y - 8, x + 70, y + 4);
        ctx.stroke();
      }
    },
    1.5,
    1.5,
  );
}

export function brassTexture(): THREE.CanvasTexture {
  const rng = mulberry32(67);
  return makeTexture(
    128,
    (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#8f6f2e');
      g.addColorStop(0.3, '#d8b967');
      g.addColorStop(0.55, '#a8843d');
      g.addColorStop(0.8, '#e2c87a');
      g.addColorStop(1, '#7d5f24');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${40 + rng() * 40}, ${80 + rng() * 40}, ${60 + rng() * 20}, ${0.05 + rng() * 0.12})`;
        ctx.beginPath();
        ctx.arc(rng() * s, rng() * s, 0.5 + rng() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1,
    1,
  );
}

export function wickerTexture(): THREE.CanvasTexture {
  const rng = mulberry32(36);
  return makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#a8844c';
      ctx.fillRect(0, 0, s, s);
      const step = 16;
      for (let y = 0; y < s; y += step) {
        for (let x = 0; x < s; x += step) {
          const horizontal = ((x / step + y / step) | 0) % 2 === 0;
          ctx.fillStyle = horizontal ? '#c2a063' : '#8d6a38';
          if (horizontal) ctx.fillRect(x, y, step, step * 0.62);
          else ctx.fillRect(x, y, step * 0.62, step);
          ctx.strokeStyle = 'rgba(60,40,15,0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, step - 1, step - 1);
        }
      }
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(70,50,20,${0.04 + rng() * 0.08})`;
        ctx.fillRect(rng() * s, rng() * s, 2, 2);
      }
    },
    1.5,
    1.5,
  );
}

export function paperTexture(): THREE.CanvasTexture {
  const rng = mulberry32(15);
  return makeTexture(
    128,
    (ctx, s) => {
      ctx.fillStyle = '#ece2c8';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 120; i++) {
        ctx.strokeStyle = `rgba(${150 + rng() * 40}, ${135 + rng() * 35}, ${100 + rng() * 30}, ${0.08 + rng() * 0.1})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        const y = rng() * s;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + rng() * 6, s * 0.7, y - rng() * 6, s, y + rng() * 3);
        ctx.stroke();
      }
    },
    1,
    1,
  );
}

export function radialGlowTexture(): THREE.CanvasTexture {
  return makeTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,235,180,0.95)');
    g.addColorStop(0.32, 'rgba(255,200,110,0.35)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}
