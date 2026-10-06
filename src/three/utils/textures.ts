import * as THREE from 'three';
import type { UtilityId } from '../../simulation/infrastructureData';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let glowTex: THREE.Texture | null = null;
/** Soft radial glow (white, alpha falloff). */
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const { c, ctx } = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = toTexture(c);
  return glowTex;
}

let poolTex: THREE.Texture | null = null;
/** Street-light pool on asphalt. */
export function getLightPoolTexture() {
  if (poolTex) return poolTex;
  const { c, ctx } = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  poolTex = toTexture(c);
  return poolTex;
}

let crackTex: THREE.Texture | null = null;
/** Jagged crack lines used as an additive decal on the damaged main. */
export function getCrackTexture() {
  if (crackTex) return crackTex;
  const { c, ctx } = canvas(512);
  ctx.clearRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const crack = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    let cx = x;
    let cy = y;
    const steps = Math.max(3, Math.floor(len / 14));
    for (let i = 0; i < steps; i++) {
      ang += (rnd() - 0.5) * 0.9;
      cx += Math.cos(ang) * (len / steps);
      cy += Math.sin(ang) * (len / steps);
      ctx.lineTo(cx, cy);
      if (depth > 0 && rnd() < 0.3) {
        crack(cx, cy, ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.8), len * 0.45, w * 0.6, depth - 1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
      }
    }
    ctx.lineWidth = w;
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,140,60,1)';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255,120,50,0.9)';
  crack(256, 256, 0.15, 220, 9, 2);
  crack(256, 256, Math.PI + 0.1, 200, 8, 2);
  ctx.shadowBlur = 4;
  ctx.strokeStyle = 'rgba(255,235,200,1)';
  seed = 7;
  crack(256, 256, 0.15, 220, 3, 2);
  crack(256, 256, Math.PI + 0.1, 200, 2.5, 2);
  crackTex = toTexture(c);
  return crackTex;
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: string, color: string) {
  ctx.save();
  ctx.translate(64, 64);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'water': {
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.bezierCurveTo(14, -6, 20, 4, 20, 12);
      ctx.arc(0, 12, 20, 0, Math.PI, false);
      ctx.bezierCurveTo(-20, 4, -14, -6, 0, -26);
      ctx.fill();
      break;
    }
    case 'electricity': {
      ctx.beginPath();
      ctx.moveTo(6, -28);
      ctx.lineTo(-16, 4);
      ctx.lineTo(0, 4);
      ctx.lineTo(-6, 28);
      ctx.lineTo(16, -4);
      ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'telecom': {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 18, 10 + i * 11, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 18, 4.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cooling': {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(0, 26);
        ctx.moveTo(-8, -18);
        ctx.lineTo(0, -10);
        ctx.lineTo(8, -18);
        ctx.moveTo(-8, 18);
        ctx.lineTo(0, 10);
        ctx.lineTo(8, 18);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'sewage': {
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.quadraticCurveTo(-7, -11, 0, -4);
      ctx.quadraticCurveTo(7, 3, 14, -4);
      ctx.moveTo(-14, 7);
      ctx.quadraticCurveTo(-7, 0, 0, 7);
      ctx.quadraticCurveTo(7, 14, 14, 7);
      ctx.stroke();
      break;
    }
    case 'warning': {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(30, 24);
      ctx.lineTo(-30, 24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a0508';
      ctx.fillRect(-3.5, -12, 7, 22);
      ctx.beginPath();
      ctx.arc(0, 17, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hospital': {
      ctx.fillRect(-7, -24, 14, 48);
      ctx.fillRect(-24, -7, 48, 14);
      break;
    }
    case 'school': {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(30, -6);
      ctx.lineTo(0, 8);
      ctx.lineTo(-30, -6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-17, 1);
      ctx.lineTo(-17, 14);
      ctx.quadraticCurveTo(0, 26, 17, 14);
      ctx.lineTo(17, 1);
      ctx.stroke();
      break;
    }
    case 'crew': {
      ctx.beginPath();
      ctx.arc(0, 4, 20, Math.PI, 0);
      ctx.lineTo(24, 8);
      ctx.lineTo(-24, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-4, -22, 8, 10);
      break;
    }
    case 'sensor': {
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 18, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 18, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

const iconCache = new Map<string, THREE.Texture>();
/** Round badge icon (dark disc, coloured ring and glyph) for 3D markers. */
export function getIconTexture(kind: UtilityId | 'warning' | 'hospital' | 'school' | 'crew' | 'sensor', color: string) {
  const key = kind + color;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const { c, ctx } = canvas(128);
  if (kind === 'warning') {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    drawIcon(ctx, kind, color);
  } else {
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4,16,28,0.92)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.save();
    ctx.translate(64, 64);
    ctx.scale(0.72, 0.72);
    ctx.translate(-64, -64);
    drawIcon(ctx, kind, color);
    ctx.restore();
  }
  const t = toTexture(c);
  iconCache.set(key, t);
  return t;
}

let ringTex: THREE.Texture | null = null;
export function getRingTexture() {
  if (ringTex) return ringTex;
  const { c, ctx } = canvas(256);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 7;
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();
  ringTex = toTexture(c);
  return ringTex;
}
