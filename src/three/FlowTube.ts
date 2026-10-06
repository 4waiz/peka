import * as THREE from 'three';

/** Animated "data/impact link" tube material: travelling dashes + growth. */
export function makeFlowTubeMaterial(colorA: string | THREE.Color, colorB: string | THREE.Color, speed = 1.5, dashes = 16) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uAlpha: { value: 0 },
      uSpeed: { value: speed },
      uDashes: { value: dashes },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uProgress; uniform float uAlpha; uniform float uSpeed; uniform float uDashes;
      uniform vec3 uColorA; uniform vec3 uColorB;
      varying vec2 vUv;
      void main(){
        float t = vUv.x;
        if (t > uProgress || uAlpha < 0.005) discard;
        float f = fract(t * uDashes - uTime * uSpeed);
        float dash = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.3, 0.55, f));
        float head = smoothstep(uProgress - 0.05, uProgress, t) * step(uProgress, 0.999);
        vec3 col = mix(uColorA, uColorB, t);
        float a = (0.22 + dash * 0.7 + head * 1.0) * uAlpha;
        gl_FragColor = vec4(col * 1.25, a);
      }`,
  });
}

export function arcCurve(from: THREE.Vector3, to: THREE.Vector3, lift: number) {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  mid.y = Math.max(from.y, to.y) + lift;
  return new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
}

/** Flat ribbon following a polyline on the ground (uv.x = distance fraction). */
export function ribbonGeometry(points: THREE.Vector3[], width: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let total = 0;
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    total += points[i].distanceTo(points[i - 1]);
    dists.push(total);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const side = new THREE.Vector3().crossVectors(up, dir).normalize().multiplyScalar(width / 2);
    const p = points[i];
    pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    const u = dists[i] / total;
    uv.push(u, 0, u, 1);
    if (i < points.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, length: total };
}

/** Densify an axis-aligned polyline with rounded corners. */
export function roundedPolyline(pts: THREE.Vector3[], radius: number, step = 0.8) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0 || i === pts.length - 1) {
      out.push(p.clone());
      continue;
    }
    const a = pts[i - 1];
    const b = pts[i + 1];
    const da = a.clone().sub(p).normalize();
    const db = b.clone().sub(p).normalize();
    const r = Math.min(radius, a.distanceTo(p) / 2, b.distanceTo(p) / 2);
    const s = p.clone().addScaledVector(da, r);
    const e = p.clone().addScaledVector(db, r);
    const curve = new THREE.QuadraticBezierCurve3(s, p.clone(), e);
    const n = Math.max(4, Math.ceil((r * 1.6) / step));
    for (let k = 0; k <= n; k++) out.push(curve.getPoint(k / n));
  }
  // densify straight runs
  const dense: THREE.Vector3[] = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    const b = out[i];
    const d = a.distanceTo(b);
    const n = Math.ceil(d / (step * 4));
    for (let k = 1; k <= n; k++) dense.push(a.clone().lerp(b, k / n));
  }
  return dense;
}
