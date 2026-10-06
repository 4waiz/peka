import * as THREE from 'three';
import { NOISE_GLSL } from './utils/glsl';
import { getCrackTexture, getGlowTexture, getIconTexture, getRingTexture } from './utils/textures';
import { damp, smoothstep } from './utils/random';
import { BENCH_Y, FACE_Z, LEAK, LOWER_FACE_Z, UTILITIES } from '../simulation/infrastructureData';

const MAX_P = 2800;
/** Trickle over the bench edge falls into the dark lower section and fades. */
const FALL_LIMIT = -36;
const G = -16;
const WATER = UTILITIES.water;
const NICHE = WATER.niche;

/**
 * Sector B-12 breach on the primary water main: glowing longitudinal crack,
 * pressurised spray (CPU particles with collisions against niche floor, bench
 * and excavation floor), drips over the bench edge, growing pools that reflect
 * the warning glow, a translucent risk volume and a pulsing warning beacon.
 */
export class LeakSimulation {
  readonly group = new THREE.Group();
  /** World point the HTML alert card's leader line attaches to. */
  readonly beaconTop = new THREE.Vector3(LEAK.x, 22, FACE_Z + 2.2);
  readonly markerPos = new THREE.Vector3(LEAK.x, NICHE.y1 + 1.5, FACE_Z + 2.2);

  private severity = 0;
  private targetSeverity = 0;
  private alert = 0;
  private targetAlert = 0;
  private emitAcc = 0;
  private dripAcc = 0;

  private crackMat: THREE.MeshBasicMaterial;
  private glow: THREE.Sprite;
  private mist: THREE.Sprite;
  private light: THREE.PointLight;
  private fill: THREE.PointLight;

  private pos = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private aLife = new Float32Array(MAX_P);
  private aSize = new Float32Array(MAX_P);
  private aType = new Float32Array(MAX_P);
  private cursor = 0;
  private points: THREE.Points;
  private pointsGeo: THREE.BufferGeometry;
  private pointsMat: THREE.ShaderMaterial;

  private pools: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; r: number; target: (s: number) => number }[] = [];

  private volume: THREE.Group;
  private volumeMat: THREE.ShaderMaterial;
  private volumeEdges: THREE.LineBasicMaterial;
  private marker: THREE.Sprite;
  private rings: THREE.Sprite[] = [];
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private groundRing: THREE.Mesh;
  private groundRingMat: THREE.ShaderMaterial;

  private crack = new THREE.Vector3(...LEAK.crack);
  private jet = new THREE.Vector3(0, -0.32, 0.95).normalize();

  constructor() {
    const r = WATER.conduits[0].r;
    const [lx, ly, lz] = LEAK.center;

    // ---- crack decal hugging the pipe ---------------------------------
    const crackTex = getCrackTexture().clone();
    crackTex.center.set(0.5, 0.5);
    crackTex.rotation = Math.PI / 2;
    crackTex.needsUpdate = true;
    const centreAngle = Math.atan2(-0.42, 0.9);
    const crackGeo = new THREE.CylinderGeometry(r * 1.015, r * 1.015, 5.4, 32, 1, true, centreAngle - 0.75, 1.5);
    crackGeo.rotateZ(Math.PI / 2);
    this.crackMat = new THREE.MeshBasicMaterial({
      map: crackTex,
      color: new THREE.Color(3.5, 1.6, 0.7),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const crackMesh = new THREE.Mesh(crackGeo, this.crackMat);
    crackMesh.position.set(lx, ly, lz);
    crackMesh.renderOrder = 6;
    this.group.add(crackMesh);

    // ---- glow, mist, lights -------------------------------------------
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(3.2, 0.9, 0.35), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.copy(this.crack).add(new THREE.Vector3(0, 0, 0.7));
    this.glow.renderOrder = 7;
    this.mist = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(0.55, 0.85, 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mist.position.copy(this.crack).add(new THREE.Vector3(0, -0.4, 2.2));
    this.mist.renderOrder = 7;
    this.group.add(this.glow, this.mist);

    this.light = new THREE.PointLight(0xff5a30, 0, 30, 1.6);
    this.light.position.copy(this.crack).add(new THREE.Vector3(0, 0.4, 1.6));
    this.fill = new THREE.PointLight(0x4fb6ff, 0, 18, 1.8);
    this.fill.position.set(lx, BENCH_Y + 1.5, FACE_Z + 3);
    this.group.add(this.light, this.fill);

    // ---- particles -----------------------------------------------------
    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeo.setAttribute('aLife', new THREE.BufferAttribute(this.aLife, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeo.setAttribute('aType', new THREE.BufferAttribute(this.aType, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointsGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(lx, -10, 74), 30);
    this.pointsMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 }, uDay: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSize; attribute float aType;
        uniform float uScale;
        varying float vLife; varying float vType;
        void main() {
          vLife = aLife; vType = aType;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDay;
        varying float vLife; varying float vType;
        void main() {
          if (vLife <= 0.0) discard;
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.55, 0.85, 1.25), vec3(1.1, 1.25, 1.4), smoothstep(0.25, 0.0, d));
          if (vType > 1.5) col *= 1.3;
          // daylight: readable water blue instead of glowing white
          vec3 dayCol = mix(vec3(0.08, 0.36, 0.72), vec3(0.45, 0.72, 0.95), smoothstep(0.3, 0.0, d));
          col = mix(col, dayCol, uDay);
          float fade = smoothstep(0.0, 0.12, vLife) * smoothstep(1.0, 0.8, vLife);
          float k = mix(0.55, 0.9, uDay);
          gl_FragColor = vec4(col * a * fade * k, a * fade * mix(1.0, 0.9, uDay));
        }
      `,
    });
    this.pointsMat.userData.premult = true;
    this.points = new THREE.Points(this.pointsGeo, this.pointsMat);
    this.points.renderOrder = 7;
    this.points.frustumCulled = false;
    this.group.add(this.points);

    // ---- pools ---------------------------------------------------------
    this.addPool(new THREE.Vector3(lx, NICHE.y0 + 0.025, (NICHE.backZ + FACE_Z) / 2), new THREE.Vector2(16, FACE_Z - NICHE.backZ), (s) => 1 + s * 7, [NICHE.backZ, FACE_Z]);
    this.addPool(new THREE.Vector3(lx, BENCH_Y + 0.03, (FACE_Z + LOWER_FACE_Z) / 2), new THREE.Vector2(20, LOWER_FACE_Z - FACE_Z), (s) => 0.6 + s * 8.5, [FACE_Z, LOWER_FACE_Z]);

    // ---- risk volume ---------------------------------------------------
    this.volume = new THREE.Group();
    const vSize = new THREE.Vector3(12.5, 6.8, 7);
    const vGeo = new THREE.BoxGeometry(vSize.x, vSize.y, vSize.z);
    this.volumeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uSize: { value: vSize } },
      vertexShader: /* glsl */ `
        varying vec3 vL;
        void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform vec3 uSize;
        varying vec3 vL;
        void main() {
          vec3 q = abs(vL) / (uSize * 0.5);
          vec3 e = smoothstep(0.9, 1.0, q);
          float edge = max(max(e.x * e.y, e.y * e.z), e.x * e.z);
          float grid = smoothstep(0.94, 1.0, abs(fract(vL.y * 1.2 - uTime * 0.6) * 2.0 - 1.0));
          float scan = exp(-pow((vL.y / (uSize.y * 0.5)) - (fract(uTime * 0.35) * 2.0 - 1.0), 2.0) * 60.0);
          float pulse = 0.7 + 0.3 * sin(uTime * 3.0);
          float a = (0.04 + grid * 0.06 + scan * 0.22 + edge * 0.45) * pulse * uAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.32, 0.12) * a * 1.6, a);
        }
      `,
    });
    this.volumeMat.userData.premult = true;
    const vMesh = new THREE.Mesh(vGeo, this.volumeMat);
    vMesh.renderOrder = 7;
    this.volumeEdges = new THREE.LineBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.3), transparent: true, opacity: 0 });
    const brackets = makeCornerBrackets(vSize, 1.2);
    const bLines = new THREE.LineSegments(brackets, this.volumeEdges);
    this.volume.add(vMesh, bLines);
    this.volume.position.set(lx, ly - 0.3, lz + 1.9);
    this.group.add(this.volume);

    // ---- warning beacon -------------------------------------------------
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: getIconTexture('warning', '#ff3b3b'), transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    this.marker.position.copy(this.markerPos);
    this.marker.scale.setScalar(3.2);
    this.marker.renderOrder = 20;
    this.group.add(this.marker);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: getRingTexture(), color: new THREE.Color(2.4, 0.4, 0.3), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      ring.position.copy(this.markerPos);
      ring.renderOrder = 19;
      this.rings.push(ring);
      this.group.add(ring);
    }
    const beamH = this.beaconTop.y - this.markerPos.y - 1.8;
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; varying vec2 vUv;
        void main(){
          float travel = smoothstep(0.0, 0.08, fract(vUv.y * 3.0 - uTime * 0.9)) * (1.0 - smoothstep(0.08, 0.22, fract(vUv.y * 3.0 - uTime * 0.9)));
          float a = (0.55 + travel * 0.9) * uAlpha * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(vec3(2.2, 0.35, 0.25) * a, a);
        }`,
    });
    this.beamMat.userData.premult = true;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, beamH, 6, 1, true), this.beamMat);
    this.beam.position.set(this.markerPos.x, this.markerPos.y + 1.8 + beamH / 2, this.markerPos.z);
    this.beam.renderOrder = 18;
    this.group.add(this.beam);

    this.groundRingMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float a = 0.0;
          for (int i = 0; i < 3; i++) {
            float ph = fract(uTime * 0.45 + float(i) / 3.0);
            a += smoothstep(0.035, 0.0, abs(d - ph)) * (1.0 - ph);
          }
          a += smoothstep(0.16, 0.0, d) * 0.6;
          a *= smoothstep(1.0, 0.9, d) * uAlpha;
          gl_FragColor = vec4(vec3(2.0, 0.35, 0.2) * a, a);
        }`,
    });
    this.groundRingMat.userData.premult = true;
    this.groundRing = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), this.groundRingMat);
    this.groundRing.position.set(LEAK.surface[0], LEAK.surface[1] + 0.05, LEAK.surface[2]);
    this.groundRing.renderOrder = 6;
    this.group.add(this.groundRing);
  }

  private addPool(center: THREE.Vector3, size: THREE.Vector2, target: (s: number) => number, zClip: [number, number]) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 0 },
        uCenter: { value: new THREE.Vector3(LEAK.x, center.y, center.z) },
        uClip: { value: new THREE.Vector2(...zClip) },
        uGlow: { value: 0 },
        uOrigin: { value: new THREE.Vector3(...LEAK.crack) },
      },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uRadius; uniform vec3 uCenter; uniform vec2 uClip; uniform float uGlow; uniform vec3 uOrigin;
        varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          if (uRadius < 0.05) discard;
          vec2 d = vW.xz - uCenter.xz;
          d.y *= 1.35;
          float n = pk_fbm(vW.xz * 0.45 + 2.0);
          float dist = length(d) / uRadius + (n - 0.5) * 0.35;
          float a = smoothstep(1.0, 0.8, dist);
          a *= smoothstep(uClip.x - 0.05, uClip.x + 0.25, vW.z) * smoothstep(uClip.y + 0.05, uClip.y - 0.25, vW.z);
          if (a < 0.01) discard;
          float rip = 0.0;
          float rr = length(vW.xz - uCenter.xz);
          for (int i = 0; i < 3; i++) {
            float ph = fract(uTime * 0.6 + float(i) * 0.33);
            rip += smoothstep(0.08, 0.0, abs(rr - ph * uRadius * 0.9)) * (1.0 - ph);
          }
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          vec3 col = mix(vec3(0.02, 0.06, 0.1), vec3(0.12, 0.32, 0.5), fres);
          float toLeak = length(vW - uOrigin);
          col += vec3(1.0, 0.25, 0.1) * uGlow * exp(-toLeak * 0.18) * 0.9;
          col += vec3(0.4, 0.75, 1.0) * rip * 0.22;
          col += vec3(0.5, 0.8, 1.0) * smoothstep(0.92, 0.8, dist) * (1.0 - smoothstep(0.8, 0.6, dist)) * 0.18;
          gl_FragColor = vec4(col, a * 0.88);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y).rotateX(-Math.PI / 2), mat);
    mesh.position.copy(center);
    mesh.renderOrder = 5;
    this.group.add(mesh);
    this.pools.push({ mesh, mat, r: 0, target });
  }

  setSeverity(s: number) {
    this.targetSeverity = s;
  }

  setDay(day: boolean) {
    this.pointsMat.uniforms.uDay.value = day ? 1 : 0;
    (this.mist.material as THREE.SpriteMaterial).color.setRGB(day ? 0.35 : 0.55, day ? 0.62 : 0.85, day ? 0.9 : 1.3);
  }

  setAlert(on: boolean) {
    this.targetAlert = on ? 1 : 0;
  }

  /** Current (smoothed) severity — used for soil wetness. */
  get currentSeverity() {
    return this.severity;
  }

  private spawn(type: number, p: THREE.Vector3, v: THREE.Vector3, life: number, size: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_P;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.aSize[i] = size;
    this.aType[i] = type;
  }

  private tmpP = new THREE.Vector3();
  private tmpV = new THREE.Vector3();

  update(dt: number, t: number, pixelRatio: number, viewportHeight: number) {
    this.severity = damp(this.severity, this.targetSeverity, 1.6, dt);
    this.alert = damp(this.alert, this.targetAlert, 3, dt);
    const s = this.severity;
    const a = this.alert;
    const pulse = 0.75 + 0.25 * Math.sin(t * 6.5);

    this.crackMat.opacity = smoothstep(0.04, 0.35, s) * (0.7 + 0.3 * pulse);
    (this.glow.material as THREE.SpriteMaterial).opacity = smoothstep(0.03, 0.3, s) * pulse * 0.55;
    this.glow.scale.setScalar(2.2 + s * 2.6 + pulse * 0.4);
    (this.mist.material as THREE.SpriteMaterial).opacity = smoothstep(0.15, 0.7, s) * 0.22;
    this.mist.scale.set(5 + s * 5, 3.5 + s * 2.5, 1);
    this.light.intensity = smoothstep(0.03, 0.4, s) * 60 * pulse;
    this.fill.intensity = smoothstep(0.2, 0.8, s) * 30;

    // ---- emit -----------------------------------------------------------
    const rate = s < 0.04 ? 0 : 60 + 1100 * Math.pow(s, 1.25);
    this.emitAcc += rate * dt;
    while (this.emitAcc > 1) {
      this.emitAcc -= 1;
      const p = this.tmpP.copy(this.crack);
      p.x += (Math.random() - 0.5) * 3.4;
      p.y += (Math.random() - 0.5) * 0.3;
      const v = this.tmpV.copy(this.jet);
      v.x += (Math.random() - 0.5) * 0.9;
      v.y += (Math.random() - 0.35) * 0.75;
      v.z += (Math.random() - 0.5) * 0.25;
      v.normalize().multiplyScalar((2.4 + 7.5 * s) * (0.55 + 0.45 * Math.random()));
      this.spawn(0, p, v, 1.6 + Math.random() * 0.8, 0.16 + Math.random() * 0.18 + s * 0.08);
    }
    // drips over the bench edge once the bench pool reaches it
    const benchPool = this.pools[1];
    if (benchPool.r > 4.5) {
      this.dripAcc += (40 + 260 * s) * dt;
      while (this.dripAcc > 1) {
        this.dripAcc -= 1;
        const p = this.tmpP.set(LEAK.x + (Math.random() - 0.5) * Math.min(benchPool.r * 1.2, 9), BENCH_Y - 0.02, LOWER_FACE_Z + 0.1);
        const v = this.tmpV.set((Math.random() - 0.5) * 0.3, -0.3 - Math.random() * 0.6, 0.35 + Math.random() * 0.4);
        this.spawn(1, p, v, 2.2, 0.12 + Math.random() * 0.1);
      }
    }

    // ---- integrate --------------------------------------------------------
    for (let i = 0; i < MAX_P; i++) {
      const ml = this.maxLife[i];
      if (ml <= 0) continue;
      const l = this.life[i] + dt;
      const ix = i * 3;
      let vy = this.vel[ix + 1] + G * dt;
      let x = this.pos[ix] + this.vel[ix] * dt;
      let y = this.pos[ix + 1] + vy * dt;
      let z = this.pos[ix + 2] + this.vel[ix + 2] * dt;
      let dead = l > ml;
      if (!dead) {
        if (z < FACE_Z) {
          if (y > NICHE.y1 - 0.1) {
            y = NICHE.y1 - 0.1;
            vy = -vy * 0.25;
          }
          if (y < NICHE.y0) dead = true;
          if (z < NICHE.backZ) dead = true;
        } else if (z < LOWER_FACE_Z) {
          if (y < BENCH_Y) dead = true;
        } else if (y < FALL_LIMIT) dead = true;
        if (dead && this.aType[i] < 1.5 && Math.random() < 0.35) {
          // splash
          this.spawn(2, this.tmpP.set(x, y + 0.05, z), this.tmpV.set((Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4), 0.35 + Math.random() * 0.2, 0.1);
        }
      }
      if (dead) {
        this.maxLife[i] = 0;
        this.aLife[i] = 0;
        continue;
      }
      this.life[i] = l;
      this.vel[ix + 1] = vy;
      this.pos[ix] = x;
      this.pos[ix + 1] = y;
      this.pos[ix + 2] = z;
      this.aLife[i] = l / ml;
    }
    (this.pointsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.pointsGeo.attributes.aType as THREE.BufferAttribute).needsUpdate = true;
    this.pointsMat.uniforms.uScale.value = viewportHeight * pixelRatio * 0.9;

    // ---- pools ------------------------------------------------------------
    for (const pool of this.pools) {
      const target = pool.target(s);
      pool.r = damp(pool.r, target, target > pool.r ? 0.35 : 0.8, dt);
      pool.mat.uniforms.uRadius.value = pool.r;
      pool.mat.uniforms.uTime.value = t;
      pool.mat.uniforms.uGlow.value = smoothstep(0.05, 0.4, s) * pulse;
    }

    // ---- alert visuals --------------------------------------------------------
    const ap = 0.8 + 0.2 * Math.sin(t * 4);
    this.volumeMat.uniforms.uTime.value = t;
    this.volumeMat.uniforms.uAlpha.value = a;
    this.volumeEdges.opacity = a * (0.55 + 0.35 * ap);
    this.volume.scale.setScalar(0.92 + 0.12 * s);
    (this.marker.material as THREE.SpriteMaterial).opacity = a;
    this.marker.scale.setScalar(2.8 + 0.4 * ap);
    this.rings.forEach((ring, i) => {
      const ph = (t * 0.7 + i * 0.5) % 1;
      ring.scale.setScalar(3 + ph * 7);
      (ring.material as THREE.SpriteMaterial).opacity = a * (1 - ph) * 0.8;
    });
    this.beamMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uAlpha.value = a;
    this.groundRingMat.uniforms.uTime.value = t;
    this.groundRingMat.uniforms.uAlpha.value = a;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

function makeCornerBrackets(size: THREE.Vector3, len: number) {
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const pts: number[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const c = [sx * hx, sy * hy, sz * hz];
        pts.push(...c, c[0] - sx * len, c[1], c[2]);
        pts.push(...c, c[0], c[1] - sy * len, c[2]);
        pts.push(...c, c[0], c[1], c[2] - sz * len);
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
