import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEPTH_SCALE, FACE_Z, LEAK } from '../simulation/infrastructureData';

const DEG = Math.PI / 180;
const HOME = { target: new THREE.Vector3(LEAK.x + 3, -12.5, 71.5), radius: 46, polar: 79, azimuth: 16 };

export interface UgAnchors {
  leak: { x: number; y: number; visible: boolean };
  ruler: { depth: number; y: number; visible: boolean }[];
}

/**
 * Second live view of the same scene: a close-up of the utility cross-section
 * under Sector B-12. Own renderer + camera (rendered right after the main
 * view each frame), gentle idle drift, orbit/zoom within tight limits.
 */
export class UndergroundView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly anchors: UgAnchors = {
    leak: { x: 0, y: 0, visible: false },
    ruler: Array.from({ length: 9 }, (_, i) => ({ depth: i, y: 0, visible: false })),
  };
  private width = 1;
  private height = 1;
  private ro: ResizeObserver;
  private idle = 0;
  private interacting = false;
  private tween: { t: number; from: THREE.Vector3; to: THREE.Vector3; fromR: number; toR: number } | null = null;
  private v = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    private scene: THREE.Scene,
    private leakPoint: THREE.Vector3,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'ug-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 16;
    c.maxDistance = 90;
    c.minPolarAngle = 60 * DEG;
    c.maxPolarAngle = 92 * DEG;
    c.minAzimuthAngle = -38 * DEG;
    c.maxAzimuthAngle = 52 * DEG;
    c.enablePan = false;
    c.rotateSpeed = 0.5;
    c.addEventListener('start', () => {
      this.interacting = true;
      this.tween = null;
    });
    c.addEventListener('end', () => {
      this.interacting = false;
      this.idle = 0;
    });
    this.home(true);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  /** Smoothly return to the default framing of the breach. */
  home(instant = false) {
    const to = HOME.target.clone();
    if (instant) {
      this.controls.target.copy(to);
      const s = new THREE.Spherical(HOME.radius, HOME.polar * DEG, HOME.azimuth * DEG);
      this.camera.position.copy(to).add(new THREE.Vector3().setFromSpherical(s));
      this.camera.lookAt(to);
      return;
    }
    this.tween = { t: 0, from: this.controls.target.clone(), to, fromR: this.camera.position.distanceTo(this.controls.target), toR: HOME.radius };
  }

  zoom(factor: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const r = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(r));
  }

  compile() {
    return this.renderer.compileAsync(this.scene, this.camera);
  }

  private resize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number, t: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 1.2);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      this.controls.target.lerpVectors(tw.from, tw.to, e);
      const az = HOME.azimuth * DEG;
      const s = new THREE.Spherical(THREE.MathUtils.lerp(tw.fromR, tw.toR, e), HOME.polar * DEG, az);
      const desired = this.controls.target.clone().add(new THREE.Vector3().setFromSpherical(s));
      this.camera.position.lerp(desired, e);
      if (tw.t >= 1) this.tween = null;
    } else if (!this.interacting) {
      // slow, subtle drift so the cross-section feels alive
      this.idle += dt;
      if (this.idle > 2.5) {
        const off = this.camera.position.clone().sub(this.controls.target);
        const s = new THREE.Spherical().setFromVector3(off);
        s.theta += Math.sin(t * 0.18) * 0.0009;
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(s));
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // anchors for the HTML callout + depth ruler
    this.project(this.leakPoint, this.anchors.leak);
    const rulerX = this.controls.target.x - 18;
    for (const tick of this.anchors.ruler) {
      this.v.set(rulerX, -tick.depth / DEPTH_SCALE, FACE_Z + 0.2).project(this.camera);
      tick.visible = this.v.z < 1 && this.v.y > -1.1 && this.v.y < 1.1;
      tick.y = (-this.v.y * 0.5 + 0.5) * this.height;
    }
  }

  private project(p: THREE.Vector3, out: { x: number; y: number; visible: boolean }) {
    this.v.copy(p).project(this.camera);
    out.visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
    out.x = (this.v.x * 0.5 + 0.5) * this.width;
    out.y = (-this.v.y * 0.5 + 0.5) * this.height;
  }

  dispose() {
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
