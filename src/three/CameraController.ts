import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BENCH_Y, FACE_Z, FLOOR_Y, LOWER_FACE_Z } from '../simulation/infrastructureData';
import { clamp, easeInOutCubic } from './utils/random';

export interface CamPose {
  target: [number, number, number] | THREE.Vector3;
  radius: number;
  /** degrees from vertical */
  polar: number;
  /** degrees around +Y, 0 = looking from +Z (front) */
  azimuth: number;
  fov?: number;
}

interface Tween {
  t: number;
  duration: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  from: THREE.Spherical;
  to: THREE.Spherical;
  fromFov: number;
  toFov: number;
  arc: number;
  ease: (t: number) => number;
  resolve?: () => void;
}

interface Follow {
  curve: THREE.Curve<THREE.Vector3>;
  t: number;
  duration: number;
  offset: THREE.Spherical;
  ease: (t: number) => number;
  resolve?: () => void;
}

const DEG = Math.PI / 180;

/**
 * Orbit/pan/zoom with presentation-safe limits plus scripted cinematic moves:
 * spherical-arc fly-tos (the camera swings around the subject and pulls back on
 * long hops) and path following (used to travel along the water main).
 */
export class CameraController {
  readonly controls: OrbitControls;
  private tween: Tween | null = null;
  private follow: Follow | null = null;
  private followPos = new THREE.Vector3();
  private followTarget = new THREE.Vector3();
  onUserInteract: (() => void) | null = null;
  private mapMode = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.075;
    c.screenSpacePanning = false;
    c.minDistance = 8;
    c.maxDistance = 520;
    c.minPolarAngle = 0.02;
    c.maxPolarAngle = 89 * DEG;
    c.minAzimuthAngle = -100 * DEG;
    c.maxAzimuthAngle = 100 * DEG;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.9;
    c.zoomToCursor = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.addEventListener('start', () => {
      if (this.tween || this.follow) this.cancel();
      this.onUserInteract?.();
    });
  }

  get busy() {
    return !!this.tween || !!this.follow;
  }

  setMapMode(on: boolean) {
    this.mapMode = on;
    this.controls.enableRotate = !on;
    this.controls.minAzimuthAngle = on ? -Infinity : -100 * DEG;
    this.controls.maxAzimuthAngle = on ? Infinity : 100 * DEG;
  }

  setAutoOrbit(on: boolean, speed = 0.35) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = speed;
  }

  cancel() {
    const tw = this.tween;
    const fo = this.follow;
    this.tween = null;
    this.follow = null;
    this.controls.enabled = true;
    tw?.resolve?.();
    fo?.resolve?.();
  }

  flyTo(pose: CamPose, duration = 2.2, opts: { arc?: number; ease?: (t: number) => number } = {}) {
    this.cancel();
    const toTarget = pose.target instanceof THREE.Vector3 ? pose.target.clone() : new THREE.Vector3(...pose.target);
    const fromTarget = this.controls.target.clone();
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(fromTarget));
    const to = new THREE.Spherical(pose.radius, Math.max(0.0005, pose.polar * DEG), pose.azimuth * DEG);
    // shortest azimuth path
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    to.theta = from.theta + dTheta;
    const travel = fromTarget.distanceTo(toTarget);
    const arc = opts.arc ?? Math.min(110, travel * 0.3);
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    return new Promise<void>((resolve) => {
      this.tween = {
        t: 0,
        duration: Math.max(0.05, duration),
        fromTarget,
        toTarget,
        from,
        to,
        fromFov: this.camera.fov,
        toFov: pose.fov ?? this.camera.fov,
        arc,
        ease: opts.ease ?? easeInOutCubic,
        resolve,
      };
    });
  }

  /** Move the look-at target along a curve with the camera riding at a spherical offset. */
  followCurve(curve: THREE.Curve<THREE.Vector3>, duration: number, offset: { radius: number; polar: number; azimuth: number }, ease: (t: number) => number = (t) => t) {
    this.cancel();
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.followTarget.copy(this.controls.target);
    this.followPos.copy(this.camera.position);
    return new Promise<void>((resolve) => {
      this.follow = {
        curve,
        t: 0,
        duration,
        offset: new THREE.Spherical(offset.radius, offset.polar * DEG, offset.azimuth * DEG),
        ease,
        resolve,
      };
    });
  }

  update(dt: number) {
    const cam = this.camera;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const e = tw.ease(tw.t);
      const target = tw.fromTarget.clone().lerp(tw.toTarget, e);
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, e) + Math.sin(Math.PI * e) * tw.arc,
        THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, e),
        THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, e),
      );
      cam.position.copy(target).add(new THREE.Vector3().setFromSpherical(s));
      cam.fov = THREE.MathUtils.lerp(tw.fromFov, tw.toFov, e);
      cam.updateProjectionMatrix();
      this.controls.target.copy(target);
      cam.lookAt(target);
      if (tw.t >= 1) {
        this.tween = null;
        this.controls.enabled = true;
        tw.resolve?.();
      }
    } else if (this.follow) {
      const f = this.follow;
      f.t = Math.min(1, f.t + dt / f.duration);
      const p = f.curve.getPointAt(clamp(f.ease(f.t), 0, 1));
      const desiredPos = p.clone().add(new THREE.Vector3().setFromSpherical(f.offset));
      const k = 1 - Math.exp(-4.5 * dt);
      this.followTarget.lerp(p, k);
      this.followPos.lerp(desiredPos, k);
      cam.position.copy(this.followPos);
      this.controls.target.copy(this.followTarget);
      cam.lookAt(this.followTarget);
      if (f.t >= 1 && this.followPos.distanceTo(desiredPos) < 0.5) {
        this.follow = null;
        this.controls.enabled = true;
        f.resolve?.();
      }
    } else {
      this.controls.update(dt);
    }
    this.guard();
  }

  /** Keep the camera out of the soil volume and the target in a sane area. */
  private guard() {
    const p = this.camera.position;
    const t = this.controls.target;
    t.x = clamp(t.x, -260, 260);
    t.z = clamp(t.z, -220, 130);
    t.y = clamp(t.y, FLOOR_Y + 2, 60);
    if (this.mapMode) return;
    if (p.z < FACE_Z + 0.8 && p.y < 1.2) p.y = 1.2;
    else if (p.z < LOWER_FACE_Z + 0.8 && p.y < BENCH_Y + 0.6) p.y = BENCH_Y + 0.6;
    if (p.y < FLOOR_Y + 1) p.y = FLOOR_Y + 1;
  }

  dispose() {
    this.controls.dispose();
  }
}
