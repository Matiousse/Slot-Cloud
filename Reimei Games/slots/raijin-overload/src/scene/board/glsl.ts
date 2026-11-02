// Shared GLSL snippets for the board shaders (noise, fbm, jagged bolts).

export const NOISE = /* glsl */ `
  float bh(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float bh1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
  float bn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(bh(i), bh(i + vec2(1.0, 0.0)), u.x), mix(bh(i + vec2(0.0, 1.0)), bh(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float bfbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * bn(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  float bfbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * bn(p);
      p = p * 2.07 + vec2(5.3, 1.1);
      a *= 0.5;
    }
    return v;
  }
  // jagged lightning offset along a 1D axis (sum of stepped noises)
  float jag(float y, float seed) {
    return (bn(vec2(y * 3.1, seed)) - 0.5) * 0.6 + (bn(vec2(y * 9.7, seed + 7.3)) - 0.5) * 0.28 + (bn(vec2(y * 23.0, seed + 3.1)) - 0.5) * 0.1;
  }
`;

/** Plain vertex shader passing local position + uv. */
export const VERT_LOCAL = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
