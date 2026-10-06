/** Shared GLSL helpers (hashes, value noise, fbm). */
export const NOISE_GLSL = /* glsl */ `
float pk_hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float pk_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float pk_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pk_hash12(i), pk_hash12(i + vec2(1.0, 0.0)), u.x),
             mix(pk_hash12(i + vec2(0.0, 1.0)), pk_hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float pk_fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * pk_noise(p);
    p = p * 2.03 + 17.13;
    a *= 0.5;
  }
  return v;
}
`;
