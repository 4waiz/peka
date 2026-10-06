import * as THREE from 'three';
import { NOISE_GLSL } from './utils/glsl';
import { damp } from './utils/random';
import { FACE_Z, LEAK } from '../simulation/infrastructureData';

/**
 * Ground-level risk heat map centred on the breach (with contour lines) and a
 * translucent failure "blast radius" dome showing the predicted impact zone.
 */
export class RiskOverlay {
  readonly group = new THREE.Group();
  private heatMat: THREE.ShaderMaterial;
  private domeMat: THREE.ShaderMaterial;
  private ringMat: THREE.ShaderMaterial;
  private dome: THREE.Mesh;
  private ring: THREE.Mesh;
  private heat = 0;
  private targetHeat = 0;
  private blast = 0;
  private targetBlast = 0;
  private spread = 0.3;
  private targetSpread = 0.3;

  constructor() {
    const cx = LEAK.x;
    const cz = LEAK.surface[2];
    this.heatMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uRadius: { value: 30 },
        uCenter: { value: new THREE.Vector2(cx, cz) },
        uClipZ: { value: FACE_Z },
      },
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uIntensity; uniform float uRadius; uniform vec2 uCenter; uniform float uClipZ;
        varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          if (vW.z > uClipZ || uIntensity < 0.01) discard;
          vec2 d = vW.xz - uCenter;
          d.y *= 0.82;
          float n = pk_fbm(vW.xz * 0.04 + vec2(uTime * 0.03, 0.0));
          float r = length(d) / uRadius + (n - 0.5) * 0.45;
          float heat = exp(-r * r * 2.0);
          float contour = smoothstep(0.08, 0.0, abs(fract(heat * 6.0 - uTime * 0.15) - 0.5) - 0.42) * step(0.08, heat);
          vec3 col = mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.18, 0.08), smoothstep(0.35, 0.9, heat));
          float a = (heat * 0.42 + contour * 0.22 * heat) * uIntensity;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const heat = new THREE.Mesh(new THREE.PlaneGeometry(200, 150).rotateX(-Math.PI / 2), this.heatMat);
    heat.position.set(cx, 0.46, cz - 70);
    heat.renderOrder = 3;
    this.group.add(heat);

    this.domeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uClipZ: { value: FACE_Z } },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec3 vN; varying vec3 vL;
        void main(){
          vL = position;
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform float uClipZ;
        varying vec3 vW; varying vec3 vN; varying vec3 vL;
        void main(){
          if (vW.z > uClipZ) discard;
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
          float lat = smoothstep(0.035, 0.0, abs(fract(vL.y * 6.0 - uTime * 0.25) - 0.5) - 0.46);
          float lon = smoothstep(0.02, 0.0, abs(fract(atan(vL.z, vL.x) * 3.8197) - 0.5) - 0.48);
          float a = (fres * 0.32 + lat * 0.12 + lon * 0.06) * uAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.3, 0.14) * a, a);
        }`,
    });
    this.domeMat.userData.premult = true;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMat);
    this.dome.position.set(cx, 0.3, cz);
    this.dome.renderOrder = 6;
    this.group.add(this.dome);

    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uClipZ: { value: FACE_Z } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAlpha; uniform float uClipZ;
        varying vec2 vUv; varying vec3 vW;
        void main(){
          if (vW.z > uClipZ) discard;
          vec2 c = vUv - 0.5;
          float d = length(c) * 2.0;
          float ang = atan(c.y, c.x);
          float dash = step(0.5, fract(ang * 18.0 / 6.2831 * 4.0 + uTime * 0.2));
          float ring = smoothstep(0.012, 0.0, abs(d - 0.985)) * (0.5 + 0.5 * dash);
          float inner = smoothstep(1.0, 0.0, d) * 0.05;
          float a = (ring * 0.9 + inner) * uAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.35, 0.15) * a, a);
        }`,
    });
    this.ringMat.userData.premult = true;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.set(cx, 0.5, cz);
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
  }

  /** 0..1 heat-map strength. */
  setHeat(v: number) {
    this.targetHeat = v;
  }

  /** 0..1 blast-radius visibility. */
  setBlast(v: number) {
    this.targetBlast = v;
  }

  /** 0..1 spread of the impact (grows with forecast horizon). */
  setSpread(v: number) {
    this.targetSpread = v;
  }

  update(dt: number, t: number) {
    this.heat = damp(this.heat, this.targetHeat, 2.5, dt);
    this.blast = damp(this.blast, this.targetBlast, 3, dt);
    this.spread = damp(this.spread, this.targetSpread, 1.5, dt);
    const u = this.heatMat.uniforms;
    u.uTime.value = t;
    u.uIntensity.value = this.heat;
    u.uRadius.value = 18 + this.spread * 34;
    const R = 26 + this.spread * 30;
    this.dome.scale.set(R, R * 0.42, R);
    this.ring.scale.set(R, 1, R);
    this.domeMat.uniforms.uTime.value = t;
    this.domeMat.uniforms.uAlpha.value = this.blast;
    this.ringMat.uniforms.uTime.value = t;
    this.ringMat.uniforms.uAlpha.value = this.blast;
    this.dome.visible = this.blast > 0.01;
    this.ring.visible = this.blast > 0.01;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
