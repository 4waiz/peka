import * as THREE from 'three';

export interface LabelOptions {
  className?: string;
  /** hide when the camera is farther than this from the anchor */
  maxDistance?: number;
  minDistance?: number;
  visible?: boolean;
  onClick?: () => void;
}

interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  opts: LabelOptions;
  visible: boolean;
  shown: boolean;
}

/**
 * Lightweight HTML labels anchored to 3D points. Positions are written
 * directly to `transform` every frame (no React re-renders).
 */
export class LabelManager {
  private labels = new Map<string, Label>();
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement) {}

  add(id: string, html: string, pos: THREE.Vector3, opts: LabelOptions = {}) {
    const el = document.createElement('div');
    el.className = `twin-label ${opts.className ?? ''}`;
    el.innerHTML = html;
    el.style.opacity = '0';
    if (opts.onClick) {
      el.classList.add('is-clickable');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClick?.();
      });
    }
    this.container.appendChild(el);
    this.labels.set(id, { el, pos: pos.clone(), opts, visible: opts.visible ?? true, shown: false });
    return el;
  }

  setVisible(id: string, v: boolean) {
    const l = this.labels.get(id);
    if (l) l.visible = v;
  }

  setPosition(id: string, p: THREE.Vector3) {
    this.labels.get(id)?.pos.copy(p);
  }

  setHTML(id: string, html: string) {
    const l = this.labels.get(id);
    if (l && l.el.innerHTML !== html) l.el.innerHTML = html;
  }

  toggleClass(id: string, cls: string, on: boolean) {
    this.labels.get(id)?.el.classList.toggle(cls, on);
  }

  update(camera: THREE.PerspectiveCamera, width: number, height: number) {
    for (const l of this.labels.values()) {
      let show = l.visible;
      if (show) {
        const d = camera.position.distanceTo(l.pos);
        if (l.opts.maxDistance && d > l.opts.maxDistance) show = false;
        if (l.opts.minDistance && d < l.opts.minDistance) show = false;
      }
      if (show) {
        this.v.copy(l.pos).project(camera);
        if (this.v.z > 1 || this.v.z < -1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) show = false;
        else {
          const x = (this.v.x * 0.5 + 0.5) * width;
          const y = (-this.v.y * 0.5 + 0.5) * height;
          l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
      }
      if (show !== l.shown) {
        l.shown = show;
        l.el.style.opacity = show ? '1' : '0';
        l.el.style.pointerEvents = show && l.opts.onClick ? 'auto' : 'none';
      }
    }
  }

  dispose() {
    for (const l of this.labels.values()) l.el.remove();
    this.labels.clear();
  }
}
