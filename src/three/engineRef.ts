import type { TwinEngine } from './TwinEngine';

let engine: TwinEngine | null = null;
let ugHost: HTMLElement | null = null;
const waiters: ((e: TwinEngine) => void)[] = [];

export function setEngine(e: TwinEngine | null) {
  engine = e;
  if (!e) return;
  // (re)attach the underground close-up whenever an engine comes up
  if (ugHost) e.attachUnderground(ugHost);
  waiters.splice(0).forEach((w) => w(e));
}

/** The live digital-twin engine (null until the canvas is mounted). */
export function getEngine() {
  return engine;
}

export function whenEngine(cb: (e: TwinEngine) => void) {
  if (engine) cb(engine);
  else waiters.push(cb);
}

/** Register the DOM host for the second (underground) view. */
export function setUndergroundHost(el: HTMLElement | null) {
  ugHost = el;
  if (!engine) return;
  if (el) engine.attachUnderground(el);
  else engine.detachUnderground();
}
