import * as THREE from 'three';
import { arcCurve, makeFlowTubeMaterial } from './FlowTube';
import { getGlowTexture, getIconTexture } from './utils/textures';
import { damp } from './utils/random';
import { FACILITIES, LEAK, POPULATION_POINT, ROAD_CLOSURE, SENSOR_NODES } from '../simulation/infrastructureData';

interface Arc {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  progress: number;
  delay: number;
}

/**
 * Impact analysis + telemetry correlation overlays:
 *  - sensor nodes in B-12 whose data streams converge on the breach
 *  - arcs from the breach to hospital / school / residents / road
 *  - facility beacons, road-closure ribbon with barriers
 */
export class ImpactOverlay {
  readonly group = new THREE.Group();
  readonly anchors: Record<string, THREE.Vector3> = {};
  private impact = 0;
  private targetImpact = 0;
  private corr = 0;
  private targetCorr = 0;
  private corrTime = 0;
  private impactTime = 0;
  private impactArcs: Arc[] = [];
  private corrArcs: Arc[] = [];
  private nodeMats: THREE.MeshBasicMaterial[] = [];
  private nodeRings: THREE.Mesh[] = [];
  private burst: THREE.Sprite;
  private facilitySprites: THREE.Sprite[] = [];
  private facilityRings: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  private roadMat: THREE.ShaderMaterial;
  private barrierMat: THREE.MeshBasicMaterial;
  private crossMat: THREE.MeshBasicMaterial;
  private readonly convergence = new THREE.Vector3(LEAK.x, 15, 62);

  constructor() {
    const src = new THREE.Vector3(LEAK.surface[0], 0.6, LEAK.surface[2]);

    // ---- facility props (always visible) ----------------------------------
    const hosp = FACILITIES.find((f) => f.id === 'hospital')!;
    const helipad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.8 }));
    helipad.position.set(hosp.position[0] + 3, 18.1, 7);
    const padRing = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 1.2) }));
    padRing.position.set(hosp.position[0] + 3, 18.25, 7);
    this.crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.35) });
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 0.25), this.crossMat);
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.4, 0.25), this.crossMat);
    const cross = new THREE.Group();
    cross.add(crossA, crossB);
    cross.position.set(hosp.position[0] - 4, 15.5, 14.15);
    this.group.add(helipad, padRing, cross);

    // ---- facility beacons + rings ---------------------------------------------
    for (const f of FACILITIES) {
      const pos = new THREE.Vector3(...f.position);
      const icon = f.id === 'hospital' ? getIconTexture('hospital', '#ff5a5a') : getIconTexture('school', '#ffb347');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon, transparent: true, opacity: 0.35, depthWrite: false }));
      sp.position.copy(pos).add(new THREE.Vector3(0, 4.5, 0));
      sp.scale.setScalar(4.2);
      sp.renderOrder = 9;
      this.group.add(sp);
      this.facilitySprites.push(sp);
      this.anchors[f.id] = sp.position.clone().add(new THREE.Vector3(0, 3, 0));
      const ring = this.makePulseRing(f.id === 'hospital' ? '#ff5a5a' : '#ffb347', 22);
      ring.mesh.position.set(pos.x, 0.5, pos.z);
      this.facilityRings.push(ring);
      this.group.add(ring.mesh);
    }
    this.anchors.population = new THREE.Vector3(...POPULATION_POINT).add(new THREE.Vector3(0, 6, 0));

    // ---- impact arcs ------------------------------------------------------------
    const targets: [THREE.Vector3, string, number][] = [
      [new THREE.Vector3(hosp.position[0], 18.5, 8), '#ff5a5a', 0],
      [new THREE.Vector3(...FACILITIES[1].position), '#ffb347', 0.25],
      [new THREE.Vector3(...POPULATION_POINT), '#ffd27a', 0.5],
      [new THREE.Vector3((ROAD_CLOSURE.x0 + ROAD_CLOSURE.x1) / 2 - 8, 0.6, ROAD_CLOSURE.z), '#ff8a3c', 0.7],
    ];
    for (const [to, color, delay] of targets) {
      const curve = arcCurve(src, to, 12 + src.distanceTo(to) * 0.12);
      const mat = makeFlowTubeMaterial('#ff4a2a', color, 1.6, 22);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.2, 6, false), mat);
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.impactArcs.push({ mesh, mat, progress: 0, delay });
    }

    // ---- road closure ribbon -------------------------------------------------------
    this.roadMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform float uTime; varying vec2 vUv;
        void main(){
          float stripe = step(0.5, fract((vUv.x * 46.0 + vUv.y * 2.0) - uTime * 0.6));
          float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          vec3 col = mix(vec3(0.05, 0.03, 0.02), vec3(1.6, 0.7, 0.15), stripe);
          gl_FragColor = vec4(col, (0.35 + 0.35 * stripe) * edge * uAlpha);
        }`,
    });
    const roadLen = ROAD_CLOSURE.x1 - ROAD_CLOSURE.x0;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 7.2).rotateX(-Math.PI / 2), this.roadMat);
    road.position.set((ROAD_CLOSURE.x0 + ROAD_CLOSURE.x1) / 2, 0.08, ROAD_CLOSURE.z);
    road.renderOrder = 3;
    this.group.add(road);
    this.barrierMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.0, 0.2), transparent: true, opacity: 0 });
    for (const x of [ROAD_CLOSURE.x0, ROAD_CLOSURE.x1]) {
      for (let k = -1; k <= 1; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 2.0), this.barrierMat);
        b.position.set(x, 0.5, ROAD_CLOSURE.z + k * 2.3);
        this.group.add(b);
      }
    }

    // ---- sensor nodes + correlation streams ---------------------------------------
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x3a4652, metalness: 0.7, roughness: 0.3 });
    for (const n of SENSOR_NODES) {
      const p = new THREE.Vector3(...n.position);
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 8), pylonMat);
      pylon.position.set(p.x, p.y + 1.2, p.z);
      const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 3.0) });
      this.nodeMats.push(headMat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), headMat);
      head.position.set(p.x, p.y + 2.6, p.z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 2.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.set(p.x, p.y + 0.15, p.z);
      this.nodeRings.push(ring);
      this.group.add(pylon, head, ring);
      this.anchors[n.id] = new THREE.Vector3(p.x, p.y + 4, p.z);

      const curve = arcCurve(new THREE.Vector3(p.x, p.y + 2.6, p.z), this.convergence, 6 + p.distanceTo(this.convergence) * 0.1);
      const mat = makeFlowTubeMaterial('#3fd8ff', '#ff6a3d', 2.2, 14);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.12, 6, false), mat);
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.corrArcs.push({ mesh, mat, progress: 0, delay: SENSOR_NODES.indexOf(n) * 0.18 });
    }
    this.burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: new THREE.Color(3, 1.0, 0.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.burst.position.copy(this.convergence);
    this.burst.renderOrder = 10;
    this.group.add(this.burst);
    this.anchors.convergence = this.convergence.clone().add(new THREE.Vector3(0, 3, 0));
  }

  private makePulseRing(color: string, size: number) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float a = 0.0;
          for (int i = 0; i < 2; i++) { float ph = fract(uTime * 0.5 + float(i) * 0.5); a += smoothstep(0.04, 0.0, abs(d - ph)) * (1.0 - ph); }
          a += smoothstep(1.0, 0.95, d) * smoothstep(0.9, 0.95, d) * 0.6;
          gl_FragColor = vec4(uColor * 1.6, a * uAlpha);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    mesh.renderOrder = 3;
    return { mesh, mat };
  }

  setImpact(on: boolean) {
    if (on && this.targetImpact === 0) this.impactTime = 0;
    this.targetImpact = on ? 1 : 0;
  }

  setCorrelation(on: boolean) {
    if (on && this.targetCorr === 0) this.corrTime = 0;
    this.targetCorr = on ? 1 : 0;
  }

  update(dt: number, t: number) {
    this.impact = damp(this.impact, this.targetImpact, 3, dt);
    this.corr = damp(this.corr, this.targetCorr, 3, dt);
    if (this.targetImpact > 0) this.impactTime += dt;
    if (this.targetCorr > 0) this.corrTime += dt;

    for (const a of this.impactArcs) {
      const p = this.targetImpact > 0 ? Math.min(1, Math.max(0, (this.impactTime - a.delay) / 1.4)) : a.progress;
      a.progress = p;
      a.mat.uniforms.uProgress.value = p;
      a.mat.uniforms.uAlpha.value = this.impact;
      a.mat.uniforms.uTime.value = t;
      a.mesh.visible = this.impact > 0.01;
    }
    for (const a of this.corrArcs) {
      const p = this.targetCorr > 0 ? Math.min(1, Math.max(0, (this.corrTime - a.delay) / 1.6)) : a.progress;
      a.progress = p;
      a.mat.uniforms.uProgress.value = p;
      a.mat.uniforms.uAlpha.value = this.corr;
      a.mat.uniforms.uTime.value = t;
      a.mesh.visible = this.corr > 0.01;
    }
    const allArrived = this.corrArcs.every((a) => a.progress >= 1);
    const bm = this.burst.material as THREE.SpriteMaterial;
    const bp = allArrived && this.targetCorr > 0 ? 0.75 + 0.25 * Math.sin(t * 8) : 0;
    bm.opacity = damp(bm.opacity, bp * this.corr, 6, dt);
    this.burst.scale.setScalar(5 + bm.opacity * 5);

    const blink = this.corr > 0.05 ? 0.5 + 0.5 * Math.sin(t * 10) : 0.7 + 0.3 * Math.sin(t * 2);
    for (const m of this.nodeMats) m.color.setRGB(0.5 * blink + 0.2, 2.2 * blink + 0.4, 3.0 * blink + 0.4);
    this.nodeRings.forEach((r, i) => {
      const ph = (t * 0.8 + i * 0.25) % 1;
      r.scale.setScalar(1 + ph * 2.5 * (0.4 + this.corr));
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * (0.25 + this.corr * 0.75);
    });

    for (const sp of this.facilitySprites) {
      (sp.material as THREE.SpriteMaterial).opacity = 0.35 + 0.65 * this.impact;
      sp.scale.setScalar(4.2 + this.impact * (0.8 + 0.4 * Math.sin(t * 4)));
    }
    for (const r of this.facilityRings) {
      r.mat.uniforms.uTime.value = t;
      r.mat.uniforms.uAlpha.value = this.impact;
      r.mesh.visible = this.impact > 0.01;
    }
    this.roadMat.uniforms.uAlpha.value = this.impact;
    this.roadMat.uniforms.uTime.value = t;
    this.barrierMat.opacity = this.impact * (0.6 + 0.4 * (Math.sin(t * 6) > 0 ? 1 : 0.3));
    const cb = 0.85 + 0.15 * Math.sin(t * 1.5);
    this.crossMat.color.setRGB(3 * cb, 0.35 * cb, 0.35 * cb);
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
