import * as THREE from 'three';
import { ribbonGeometry, roundedPolyline } from './FlowTube';
import { getGlowTexture, getIconTexture } from './utils/textures';
import { Rng, damp, easeInOutSine } from './utils/random';
import { CANAL, CREW_ROUTE, MAIN, ROAD_W, X_ROADS, Z_ROADS, rectContains } from '../simulation/infrastructureData';

interface Lane {
  axis: 'x' | 'z';
  fixed: number;
  from: number;
  to: number;
  dir: 1 | -1;
}

interface Car {
  lane: number;
  t: number;
  speed: number;
}

/**
 * City traffic as instanced light streaks (white headlights / red tail lights)
 * plus the maintenance crew vehicle that drives the repair route to B-12.
 */
export class VehicleSystem {
  readonly group = new THREE.Group();
  private lanes: Lane[] = [];
  private cars: Car[] = [];
  private traffic: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  private crew: THREE.Group;
  private crewBarA: THREE.MeshBasicMaterial;
  private crewBarB: THREE.MeshBasicMaterial;
  private crewGlow: THREE.Sprite;
  private crewIcon: THREE.Sprite;
  private crewPath: THREE.CatmullRomCurve3;
  private crewState: 'idle' | 'enroute' | 'onsite' = 'idle';
  private crewT = 0;
  private crewDuration = 26;
  private crewVisible = 0;
  readonly crewAnchor = new THREE.Vector3();

  private routeMat: THREE.ShaderMaterial;
  private routeAlpha = 0;
  private routeTarget = 0;
  /** street-slab reveal (0..1) — set by the engine */
  reveal = 0;

  constructor() {
    const rng = new Rng(4242);
    const inCanal = (x: number, z: number) => CANAL.rects.some((r) => rectContains(r, x, z));
    for (const z of Z_ROADS) {
      this.lanes.push({ axis: 'x', fixed: z - 2, from: -520, to: 520, dir: 1 });
      this.lanes.push({ axis: 'x', fixed: z + 2, from: -520, to: 520, dir: -1 });
    }
    for (const x of X_ROADS) {
      const from = -520;
      const to = Z_ROADS[3] + ROAD_W / 2 - 0.5;
      if (inCanal(x, -100)) continue;
      this.lanes.push({ axis: 'z', fixed: x - 2, from, to, dir: 1 });
      this.lanes.push({ axis: 'z', fixed: x + 2, from, to, dir: -1 });
    }
    this.lanes.forEach((_, li) => {
      const n = 14;
      for (let i = 0; i < n; i++) this.cars.push({ lane: li, t: (i + rng.next() * 0.6) / n, speed: rng.range(9, 16) });
    });
    this.traffic = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.cars.length);
    const head = new THREE.Color(1.7, 1.55, 1.3);
    const tail = new THREE.Color(1.6, 0.12, 0.08);
    this.cars.forEach((c, i) => {
      const lane = this.lanes[c.lane];
      this.traffic.setColorAt(i, lane.dir > 0 ? head : tail);
    });
    this.traffic.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.traffic.frustumCulled = false;
    this.group.add(this.traffic);

    // ---- crew vehicle ---------------------------------------------------------
    this.crew = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.45, metalness: 0.3, emissive: 0x2a1000 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 1.7), bodyMat);
    body.position.y = 1.0;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.6), new THREE.MeshStandardMaterial({ color: 0xeef3f7, roughness: 0.4 }));
    cab.position.set(1.9, 0.85, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.18, 1.72), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) }));
    stripe.position.y = 0.85;
    this.crewBarA = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.1) });
    this.crewBarB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.8, 3) });
    const barA = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.5), this.crewBarA);
    barA.position.set(0.4, 1.85, -0.35);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.5), this.crewBarB);
    barB.position.set(0.4, 1.85, 0.35);
    this.crewGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(2.4, 1.0, 0.2), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.crewGlow.position.set(0, 2.2, 0);
    this.crewGlow.scale.setScalar(6);
    this.crewIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: getIconTexture('crew', '#3dffa8'), transparent: true, depthWrite: false, depthTest: false }));
    this.crewIcon.position.set(0, 6.5, 0);
    this.crewIcon.scale.setScalar(3.4);
    this.crewIcon.renderOrder = 15;
    this.crew.add(body, cab, stripe, barA, barB, this.crewGlow, this.crewIcon);
    this.crew.visible = false;
    this.group.add(this.crew);

    const pts = roundedPolyline(
      CREW_ROUTE.map(([x, z]) => new THREE.Vector3(x, 0.3, z)),
      4,
    );
    this.crewPath = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.1);

    // ---- route ribbon ----------------------------------------------------------
    const ribbonPts = this.crewPath.getSpacedPoints(240).map((p) => new THREE.Vector3(p.x, 0.12, p.z));
    const { geometry, length } = ribbonGeometry(ribbonPts, 2.4);
    this.routeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: length }, uProgress: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform float uLen; uniform float uProgress; varying vec2 vUv;
        void main(){
          float d = vUv.x * uLen;
          float across = abs(vUv.y - 0.5) * 2.0;
          float chevron = fract((d - across * 1.2) / 4.0 - uTime * 0.9);
          float c = smoothstep(0.0, 0.1, chevron) * (1.0 - smoothstep(0.25, 0.4, chevron));
          float edge = smoothstep(1.0, 0.8, across);
          float done = step(vUv.x, uProgress);
          vec3 col = mix(vec3(0.2, 1.6, 1.0), vec3(0.35, 0.9, 1.6), done);
          float a = (0.18 + c * 0.75) * edge * uAlpha * mix(1.0, 0.45, done);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const ribbon = new THREE.Mesh(geometry, this.routeMat);
    ribbon.renderOrder = 3;
    this.group.add(ribbon);
  }

  setDay(day: boolean) {
    const head = day ? new THREE.Color(0.95, 0.92, 0.85) : new THREE.Color(1.7, 1.55, 1.3);
    const tail = day ? new THREE.Color(0.75, 0.12, 0.1) : new THREE.Color(1.6, 0.12, 0.08);
    this.cars.forEach((c, i) => this.traffic.setColorAt(i, this.lanes[c.lane].dir > 0 ? head : tail));
    if (this.traffic.instanceColor) this.traffic.instanceColor.needsUpdate = true;
  }

  dispatch(durationSec: number) {
    this.crewState = 'enroute';
    this.crewT = 0;
    this.crewDuration = durationSec;
    this.routeTarget = 1;
  }

  reset() {
    this.crewState = 'idle';
    this.crewT = 0;
    this.routeTarget = 0;
  }

  setRouteVisible(v: boolean) {
    if (this.crewState === 'idle') this.routeTarget = v ? 1 : 0;
  }

  get crewActive() {
    return this.crewState !== 'idle';
  }

  get crewProgress() {
    return this.crewT;
  }

  update(dt: number, t: number) {
    // traffic
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const lane = this.lanes[c.lane];
      const len = lane.to - lane.from;
      c.t = (c.t + (c.speed * dt) / len) % 1;
      const s = lane.dir > 0 ? c.t : 1 - c.t;
      const v = lane.from + s * len;
      const x = lane.axis === 'x' ? v : lane.fixed;
      const z = lane.axis === 'x' ? lane.fixed : v;
      const inMain = x > MAIN.x0 - 40 && x < MAIN.x1 + 40 && z > MAIN.z0 - 60;
      const onSlabs = x > MAIN.x0 && x < MAIN.x1 && z > MAIN.z0;
      // cars on the detailed streets fade away while the slabs are broken open
      const scale = (inMain ? 1 : 0.9) * (onSlabs ? Math.max(0, 1 - this.reveal * 2.5) : 1);
      if (lane.axis === 'x') this.q.identity();
      else this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      this.m.compose(new THREE.Vector3(x, 0.55, z), this.q, new THREE.Vector3(2.0 * scale, 0.32, 0.55));
      this.traffic.setMatrixAt(i, this.m);
    }
    this.traffic.instanceMatrix.needsUpdate = true;

    // crew
    if (this.crewState === 'enroute') {
      this.crewT = Math.min(1, this.crewT + dt / this.crewDuration);
      if (this.crewT >= 1) this.crewState = 'onsite';
    }
    this.crewVisible = damp(this.crewVisible, this.crewState === 'idle' ? 0 : 1, 4, dt);
    this.crew.visible = this.crewVisible > 0.02;
    if (this.crew.visible) {
      const u = easeInOutSine(this.crewT) * 0.98 + this.crewT * 0.02;
      const p = this.crewPath.getPointAt(Math.min(0.999, u));
      const tan = this.crewPath.getTangentAt(Math.min(0.999, u));
      this.crew.position.copy(p);
      this.crew.rotation.y = Math.atan2(-tan.z, tan.x);
      this.crewAnchor.copy(p).add(new THREE.Vector3(0, 9, 0));
      const flash = Math.sin(t * 14) > 0;
      this.crewBarA.color.setRGB(flash ? 3 : 0.3, flash ? 1.2 : 0.1, 0.05);
      this.crewBarB.color.setRGB(0.05, flash ? 0.1 : 0.8, flash ? 0.3 : 3);
      (this.crewGlow.material as THREE.SpriteMaterial).opacity = (flash ? 0.7 : 0.35) * this.crewVisible;
      this.crewIcon.scale.setScalar(3.2 + Math.sin(t * 3) * 0.25);
    }
    this.routeAlpha = damp(this.routeAlpha, this.routeTarget, 3, dt);
    this.routeMat.uniforms.uAlpha.value = this.routeAlpha;
    this.routeMat.uniforms.uTime.value = t;
    this.routeMat.uniforms.uProgress.value = this.crewT;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
