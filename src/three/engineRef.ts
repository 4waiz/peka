import type { TwinEngine } from './TwinEngine';

let engine: TwinEngine | null = null;
const waiters: ((e: TwinEngine) => void)[] = [];

export function setEngine(e: TwinEngine | null) {
  engine = e;
  if (e) waiters.splice(0).forEach((w) => w(e));
}

/** The live digital-twin engine (null until the canvas is mounted). */
export function getEngine() {
  return engine;
}

export function whenEngine(cb: (e: TwinEngine) => void) {
  if (engine) cb(engine);
  else waiters.push(cb);
}
