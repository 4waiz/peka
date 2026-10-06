import * as THREE from 'three';

interface SkyPalette {
  top: string;
  horizon: string;
  glow: string;
  below: string;
  stars: number;
}

const NIGHT_SKY: SkyPalette = { top: '#01050b', horizon: '#0a1b2b', glow: '#14334b', below: '#040a11', stars: 1 };
const DAY_SKY: SkyPalette = { top: '#6f9ccc', horizon: '#d6e2ec', glow: '#f3eee6', below: '#cdd8e2', stars: 0 };

/**
 * Lighting rig with two moods:
 *  - night: cool moonlight key, faint warm city bounce, soft work-light on the cut
 *  - day:   warm sun, bright sky fill, neutral light on the cut
 * Each mood has its own procedural environment map and gradient sky.
 */
export class Lighting {
  readonly group = new THREE.Group();
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly warm: THREE.DirectionalLight;
  readonly faceKey: THREE.DirectionalLight;
  readonly sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private envNight: THREE.WebGLRenderTarget;
  private envDay: THREE.WebGLRenderTarget;

  constructor(
    renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
  ) {
    this.hemi = new THREE.HemisphereLight(0x4f78ad, 0x0a0f16, 0.62);
    this.sun = new THREE.DirectionalLight(0xa9c8ff, 1.05);
    this.warm = new THREE.DirectionalLight(0xffb582, 0.3);
    this.warm.position.set(200, 70, -160);
    this.faceKey = new THREE.DirectionalLight(0xffdcbc, 1.35);
    this.faceKey.position.set(60, 26, 300);
    this.faceKey.target.position.set(-10, -10, 70);
    this.group.add(this.hemi, this.sun, this.warm, this.faceKey, this.faceKey.target);

    this.skyMat = this.createSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    scene.add(this.group);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envNight = this.buildEnvironment(pmrem, false);
    this.envDay = this.buildEnvironment(pmrem, true);
    pmrem.dispose();
    this.setTheme(false);
  }

  setTheme(day: boolean) {
    if (day) {
      this.hemi.color.set(0xdfeaff);
      this.hemi.groundColor.set(0x8b8072);
      this.hemi.intensity = 1.35;
      this.sun.color.set(0xfff0dc);
      this.sun.intensity = 2.4;
      this.sun.position.set(-150, 320, 190);
      this.warm.intensity = 0.2;
      this.faceKey.color.set(0xfff2e6);
      this.faceKey.intensity = 1.05;
      this.scene.environment = this.envDay.texture;
      this.scene.environmentIntensity = 0.85;
    } else {
      this.hemi.color.set(0x4f78ad);
      this.hemi.groundColor.set(0x0a0f16);
      this.hemi.intensity = 0.58;
      this.sun.color.set(0xa9c8ff);
      this.sun.intensity = 0.95;
      this.sun.position.set(-160, 260, 120);
      this.warm.intensity = 0.26;
      this.faceKey.color.set(0xffdcbc);
      this.faceKey.intensity = 1.25;
      this.scene.environment = this.envNight.texture;
      this.scene.environmentIntensity = 0.32;
    }
    const p = day ? DAY_SKY : NIGHT_SKY;
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).set(p.top);
    (u.uHorizon.value as THREE.Color).set(p.horizon);
    (u.uGlow.value as THREE.Color).set(p.glow);
    (u.uBelow.value as THREE.Color).set(p.below);
    u.uStars.value = p.stars;
  }

  private createSkyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uBelow: { value: new THREE.Color() },
        uStars: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uBelow; uniform float uStars;
        varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float y = vDir.y;
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, y));
          col = mix(col, uGlow, exp(-abs(y) * 14.0) * 0.5);
          col = mix(col, uBelow, smoothstep(0.0, -0.25, y));
          vec2 sp = vec2(atan(vDir.z, vDir.x) * 180.0, y * 260.0);
          vec2 cell = floor(sp);
          float s = step(0.9968, h(cell)) * smoothstep(0.12, 0.5, y) * uStars;
          col += vec3(0.55, 0.7, 0.95) * s * 0.25 * (0.5 + 0.5 * sin(h(cell + 3.1) * 80.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }

  private buildEnvironment(pmrem: THREE.PMREMGenerator, day: boolean) {
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uDay: { value: day ? 1 : 0 } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uDay;
          varying vec3 vDir;
          void main(){
            float y = vDir.y;
            vec3 nTop = vec3(0.012, 0.03, 0.06);
            vec3 nHor = vec3(0.08, 0.15, 0.24);
            vec3 dTop = vec3(0.35, 0.55, 0.85);
            vec3 dHor = vec3(0.85, 0.9, 0.95);
            vec3 top = mix(nTop, dTop, uDay);
            vec3 hor = mix(nHor, dHor, uDay);
            vec3 col = mix(hor, top, smoothstep(0.0, 0.6, y));
            col += mix(vec3(1.0, 0.62, 0.32) * 0.28, vec3(1.0, 0.95, 0.85) * 0.3, uDay) * exp(-abs(y) * 22.0);
            vec3 ground = mix(vec3(0.015, 0.02, 0.03), vec3(0.32, 0.31, 0.29), uDay);
            col = mix(col, ground, smoothstep(0.0, -0.3, y));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    envScene.add(dome);
    const panel = new THREE.MeshBasicMaterial({ color: day ? new THREE.Color(6, 5.6, 5) : new THREE.Color(2.2, 2.4, 2.8) });
    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.8) });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(day ? 10 : 14, day ? 10 : 3), panel);
    p1.position.set(-20, 26, -30);
    p1.lookAt(0, 0, 0);
    envScene.add(p1);
    if (!day) {
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 1.6), warmMat);
      p2.position.set(25, 3, 36);
      p2.lookAt(0, 0, 0);
      envScene.add(p2);
    }
    const rt = pmrem.fromScene(envScene, 0.035);
    envScene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    warmMat.dispose();
    return rt;
  }

  dispose() {
    this.envNight.dispose();
    this.envDay.dispose();
    this.sky.geometry.dispose();
    this.skyMat.dispose();
  }
}
