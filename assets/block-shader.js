/* The Block, v8: the block that opens, on paper. A block of chocolate fudge lined with vanilla, ray-marched as a distance
   field: a floor, four walls on hinges at their feet, and a lid. Opening, the lid lifts away, the walls fold down flat with
   their vanilla lining up, so the box all but becomes the page, and the world rises up through the floor. Each world is built
   from twenty-six slabs, each the world's outline where it sits, like a scan made solid. Soft daylight on white-cream paper:
   one warm key, the paper's own bounce, two soft reflections and a thin rim; the fudge has a fine sugar grain that glints.
   Inside the block is a brass light: opening, it lights the lining, spills over the walls onto the paper as they fold, and
   settles as the world rises through it. Brass is only ever light. */
window.VFBlockShader = `
precision highp float;
uniform vec2 uRes, uShift, uJit;
uniform float uSteps, uShadowSteps, uFocal, uTexYaw, uAxis;
uniform vec3 uCam, uTarget, uBg, uKey;
uniform mat3 uRot;                 // world to object (a turn about y)
uniform float uW, uMorph, uCut, uGap, uLift, uSpread, uHide, uHideAmt;
uniform vec4 uRange;
uniform vec4 uWalls;               // how far each wall has folded down (radians): front (+z), right (+x), back (-z), left (-x)
uniform float uLidY, uLidTilt, uRiseW, uDrop, uInner, uSink, uRipple, uShaft, uFill;
uniform vec2 uLidMove;             // the lid, lifted away: its turn (radians) and how far it drifts back
uniform vec4 uCurl;                // how far each wall curls outward as it falls open, like a soft petal (radians per unit)
uniform float uExtra;              // the niches' own worlds: how far the hold has gone (lights on, the lantern, the screen)
uniform vec3 uWMin, uWMax;
uniform float uFlat;               // 1 once the box lies open (walls flat, lid gone): then only the world casts shadows         // the world's own box as it stands this frame: outside it the world is never evaluated                // the key's spot: wide while the box opens, drawn in to the world once it stands   // the lid's lift and tip, how far the world has risen, its full drop, the light inside
uniform vec3 uBMin, uBMax;         // the box the object fits in this frame, object space               // the block's extent along the stack (x, y) and the world's (z, w)
uniform float uHover, uHoverAmt, uStock, uOpen, uBeat, uWaveAng, uWaveAmp, uRise, uLine, uRestore, uPaint, uParts, uSpin;
uniform vec2 uPeople[8];
uniform float uSkN;
uniform float uSkT[6];
uniform vec3 uSkP[6];
uniform vec3 uSkS[6];
uniform mat3 uSkM[6];

#define FUDGE 0.0
#define CREAM 1.0
#define BRASS 2.0
#define DEEP 3.0
#define NS 26.0
#define NV 6.0
#define HB 0.74
#define FLOOR -0.742
#define TH 0.05                 // the box's walls and floor

// ---------- primitives ----------
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdBox2(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdCyl(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdCone(vec3 p, float r, float h) { vec2 q = vec2(length(p.xz), p.y + h); vec2 k1 = vec2(0.0, 2.0 * h); vec2 k2 = vec2(-r, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r : 0.0), abs(q.y) - h); vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0; return s * sqrt(min(dot(ca, ca), dot(cb, cb))); }
float sdRCone(vec3 p, float r1, float r2, float h) {   // round cone standing on y = 0, radius r1 at the foot and r2 at height h
  vec2 q = vec2(length(p.xz), p.y); float b = (r1 - r2) / h, a = sqrt(1.0 - b * b), k = dot(q, vec2(-b, a));
  if (k < 0.0) return length(q) - r1; if (k > a * h) return length(q - vec2(0.0, h)) - r2; return dot(q, vec2(a, b)) - r1; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 U(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

// ---------- a person: legs, body, arms, head; one unit tall, standing on y = 0, striding along dir ----------
float person(vec3 q, float stride, vec2 dir) {
  float bound = length(q - vec3(0.0, 0.52, 0.0)) - 0.62;
  if (bound > 0.08) return bound;
  vec3 sw = vec3(dir.x, 0.0, dir.y) * stride;
  vec3 side = vec3(-dir.y, 0.0, dir.x);
  float legA = sdCap(q, side * 0.07 + vec3(0.0, 0.46, 0.0), side * 0.075 + vec3(0.0, 0.05, 0.0) + sw * 0.13, 0.058);
  float legB = sdCap(q, -side * 0.07 + vec3(0.0, 0.46, 0.0), -side * 0.075 + vec3(0.0, 0.05, 0.0) - sw * 0.13, 0.058);
  float body = sdEll(q - vec3(0.0, 0.66, 0.0), vec3(0.135, 0.21, 0.135) * vec3(1.0, 1.0, 1.0));
  float armA = sdCap(q, side * 0.15 + vec3(0.0, 0.8, 0.0), side * 0.18 + vec3(0.0, 0.5, 0.0) - sw * 0.1, 0.042);
  float armB = sdCap(q, -side * 0.15 + vec3(0.0, 0.8, 0.0), -side * 0.18 + vec3(0.0, 0.5, 0.0) + sw * 0.1, 0.042);
  float head = length(q - vec3(0.0, 0.96, 0.0)) - 0.088;
  float d = smin(min(legA, legB), body, 0.05);
  d = smin(d, min(armA, armB), 0.03);
  return min(smin(d, head, 0.03), 0.08);    // capped at the switch, so the distance has no step where the bound takes over
}

// ---------- I. retail: a shelf of products; the one under the hand steps forward and turns; holding stocks the ends ----------
vec2 product(int i, vec3 q) {
  if (i == 2) {   // the carton in the middle: tall and square, so you can see it turn
    float b = sdRBox(q - vec3(0.0, 0.29, 0.0), vec3(0.1, 0.29, 0.075), 0.012);
    return vec2(b, (q.y > 0.13 && q.y < 0.36 && q.z > -0.02) ? CREAM : FUDGE);
  }
  if (i == 1 || i == 3) {   // tall bottles with a shoulder and a cap
    float body = sdCyl(q - vec3(0.0, 0.17, 0.0), 0.095, 0.17) - 0.012;
    float sh = sdRCone(q - vec3(0.0, 0.33, 0.0), 0.1, 0.04, 0.1);
    float neck = sdCyl(q - vec3(0.0, 0.47, 0.0), 0.038, 0.045);
    float d = smin(smin(body, sh, 0.04), neck, 0.02);
    float cap = sdCyl(q - vec3(0.0, 0.53, 0.0), 0.046, 0.03) - 0.006;
    return U(vec2(d, (q.y > 0.07 && q.y < 0.26 && q.z > -0.03) ? CREAM : FUDGE), vec2(cap, CREAM));
  }
  float jar = sdCyl(q - vec3(0.0, 0.11, 0.0), 0.11, 0.11) - 0.015;   // jars at the ends: short, wide, with a lid
  float lid = sdCyl(q - vec3(0.0, 0.245, 0.0), 0.118, 0.025) - 0.008;
  return U(vec2(jar, (q.y > 0.05 && q.y < 0.17) ? CREAM : FUDGE), vec2(lid, FUDGE));
}
vec2 sRetail(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.685, 0.0), vec3(0.88, 0.055, 0.36), 0.018), DEEP);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float s = 1.42 * ((i == 0 || i == 4) ? uStock : 1.0);
    if (s < 0.03) continue;
    float st = uHoverAmt * (1.0 - smoothstep(0.0, 0.6, abs(uHover - fi)));
    vec3 q = p - vec3((fi - 2.0) * 0.345, -0.63 + st * 0.05, st * 0.4);
    if (length(q.xz) - 0.24 * s > r.x) continue;
    q.xz = rot(st * 1.25) * q.xz;
    vec2 pr = product(i, q / s);
    r = U(r, vec2(pr.x * s, pr.y));
  }
  return r;
}

// ---------- II. CPG and packaging: a gable-top carton; holding lifts the top and the story climbs out ----------
float gable(vec3 p) {    // the roof of the carton: a prism from y = 0.28 to a ridge at 0.66, plus the sealed fin
  vec2 n = normalize(vec2(0.38, 0.34));
  float side = dot(vec2(abs(p.z), p.y - 0.66), n);
  float prism = max(max(side, 0.28 - p.y), abs(p.x) - 0.34);
  float fin = sdRBox(p - vec3(0.0, 0.7, 0.0), vec3(0.34, 0.06, 0.022), 0.008);
  return min(prism, fin);
}
vec2 sCarton(vec3 p) {
  float body = sdRBox(p - vec3(0.0, -0.23, 0.0), vec3(0.34, 0.51, 0.34), 0.022);
  body = max(body, -sdBox(p - vec3(0.0, 0.22, 0.0), vec3(0.31, 0.2, 0.31)));        // open at the top, under the roof
  float label = (p.z > 0.18 && p.y > -0.5 && p.y < 0.06) ? 1.0 : 0.0;
  vec2 r = vec2(body, label > 0.5 ? CREAM : FUDGE);
  vec3 q = p - vec3(0.0, 0.28 + uOpen * 0.22, -0.34);      // hinged on the back edge of the roof
  q.yz = rot(-uOpen * 0.5) * q.yz;
  q += vec3(0.0, 0.28, -0.34);
  r = U(r, vec2(gable(q), FUDGE));
  // the story that wouldn't fit on the label: a small figure climbs out and walks toward you
  float rise = smoothstep(0.15, 1.0, uOpen);
  if (rise > 0.001) {
    float sc = 0.5 * rise;
    vec3 f = (p - vec3(0.0, -0.02 + rise * 0.3, rise * 0.24)) / sc;
    r = U(r, vec2(person(f, 0.9 * smoothstep(0.6, 1.0, rise), vec2(0.0, 1.0)) * sc, CREAM));
  }
  return r;
}

// ---------- III. medicine: a heart, beating slowly, cut front to back like a scan; the chambers show in every slice ----------
float heartOuter(vec3 p) {
  vec3 q = p; q.xy = rot(0.42) * q.xy;
  float lv = sdEll(q - vec3(0.07, -0.12, 0.0), vec3(0.36, 0.52, 0.34));
  float rv = sdEll(q - vec3(-0.15, -0.04, 0.08), vec3(0.32, 0.44, 0.3));
  float d = smin(lv, rv, 0.12);
  float la = sdEll(p - vec3(0.16, 0.33, -0.12), vec3(0.24, 0.17, 0.2));
  float ra = sdEll(p - vec3(-0.3, 0.3, 0.02), vec3(0.2, 0.22, 0.2));
  d = smin(d, smin(la, ra, 0.08), 0.1);
  float ao = sdCap(p, vec3(-0.02, 0.3, 0.02), vec3(-0.05, 0.64, 0.0), 0.1);
  float arch = sdCap(p, vec3(-0.05, 0.64, 0.0), vec3(0.22, 0.68, -0.08), 0.085);
  float desc = sdCap(p, vec3(0.22, 0.68, -0.08), vec3(0.3, 0.4, -0.15), 0.075);
  float pa = sdCap(p, vec3(0.06, 0.3, 0.15), vec3(0.17, 0.58, 0.12), 0.085);
  float svc = sdCap(p, vec3(-0.35, 0.38, 0.0), vec3(-0.35, 0.74, -0.02), 0.065);
  float br1 = sdCap(p, vec3(0.0, 0.7, -0.02), vec3(-0.02, 0.86, -0.02), 0.034);
  float br2 = sdCap(p, vec3(0.12, 0.72, -0.05), vec3(0.13, 0.85, -0.05), 0.03);
  float v = min(min(ao, arch), min(desc, pa));
  v = min(v, min(svc, min(br1, br2)));
  return smin(d, v, 0.05);
}
float heartCav(vec3 p) {
  vec3 q = p; q.xy = rot(0.42) * q.xy;
  float lvc = sdEll(q - vec3(0.09, -0.1, -0.02), vec3(0.19, 0.36, 0.18));
  float rvc = sdEll(q - vec3(-0.21, -0.02, 0.11), vec3(0.14, 0.3, 0.12));
  float lac = sdEll(p - vec3(0.16, 0.33, -0.12), vec3(0.15, 0.09, 0.12));
  float rac = sdEll(p - vec3(-0.3, 0.3, 0.02), vec3(0.11, 0.13, 0.11));
  float aol = sdCap(p, vec3(-0.02, 0.3, 0.02), vec3(-0.05, 0.66, 0.0), 0.06);
  float pal = sdCap(p, vec3(0.06, 0.3, 0.15), vec3(0.17, 0.6, 0.12), 0.05);
  float svl = sdCap(p, vec3(-0.35, 0.38, 0.0), vec3(-0.35, 0.78, -0.02), 0.035);
  return min(min(min(lvc, rvc), min(lac, rac)), min(aol, min(pal, svl)));
}
vec2 sHeart(vec3 p) {
  float sc = 1.06 * (1.0 + 0.04 * uBeat);
  vec3 q = (p - vec3(0.0, 0.06, 0.0)) / sc;
  float o = heartOuter(q), c = heartCav(q);
  return vec2(max(o, -c) * sc, -c > o ? CREAM : FUDGE);
}

// ---------- IV. sports: an oval bowl of stepped tiers round a marked pitch; a wave follows the hand; holding stands the crowd up ----------
vec2 sStadium(vec3 p) {
  float e = 1.3;
  float r = length(vec2(p.x, p.z * e)), ang = atan(p.z * e, p.x);
  float da = atan(sin(ang - uWaveAng), cos(ang - uWaveAng));
  float wave = uWaveAmp * 0.1 * exp(-da * da / 0.1);
  float r0 = 0.46, r1 = 1.0;
  float surf = -0.71 + (r - r0) * 0.74 + wave + uRise * 0.05;
  float bowl = max(max(r0 - r, r - r1), max(-0.74 - p.y, (p.y - surf) * 0.8)) / e;
  float roof = max(max(r1 - 0.17 - r, r - r1), abs(p.y + 0.27) - 0.022) / e;    // a thin roof ring over the top tier
  float d = min(bowl, roof);
  float crowd = (wave > 0.02 && p.y > surf - 0.08 && r < r1 - 0.02) ? 1.0 : 0.0;
  vec2 res = vec2(d, crowd > 0.5 ? CREAM : FUDGE);
  float base = max(r - r1, abs(p.y + 0.73) - 0.012) / e;
  res = U(res, vec2(base, DEEP));
  // the pitch, with its lines in fudge
  vec2 hp = vec2(0.34, 0.21);
  float pitch = sdBox(p - vec3(0.0, -0.715, 0.0), vec3(hp.x, 0.014, hp.y));
  float w = 0.0065;
  vec2 xz = p.xz;
  float lines = min(abs(sdBox2(xz, hp - 0.03)), abs(xz.x));
  lines = min(lines, abs(length(xz) - 0.075));
  lines = min(lines, abs(sdBox2(xz - vec2(hp.x - 0.03 - 0.055, 0.0), vec2(0.055, 0.1))));
  lines = min(lines, abs(sdBox2(xz + vec2(hp.x - 0.03 - 0.055, 0.0), vec2(0.055, 0.1))));
  return U(res, vec2(pitch, lines < w ? FUDGE : CREAM));
}

// ---------- V. events: an arch on a stage, people passing; they gather to the hand and queue on hold ----------
vec2 sEvents(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.715, -0.02), vec3(0.92, 0.026, 0.62), 0.012), DEEP);
  vec3 q = p - vec3(0.0, -0.69, -0.26);
  float arch = max(sdTorus(q.xzy, vec2(0.55, 0.085)), -q.y);
  r = U(r, vec2(arch, CREAM));
  float wall = sdRBox(p - vec3(0.0, -0.4, -0.44), vec3(0.5, 0.3, 0.026), 0.01);
  r = U(r, vec2(wall, FUDGE));
  for (int i = 0; i < 8; i++) {
    vec2 at = uPeople[i];
    // walking past: the legs swing with the distance walked; in the queue they stand still
    float stride = sin(at.x * 26.0 + float(i) * 1.7) * (1.0 - uLine);
    r = U(r, vec2(person((p - vec3(at.x, -0.69, at.y)) / 0.32, stride, vec2(1.0, 0.0)) * 0.32, FUDGE));
  }
  return r;
}

// ---------- VI. art and museums: a marble torso; holding gives back what time took, first in brass light, then in stone ----------
vec2 sTorso(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.645, 0.0), vec3(0.32, 0.095, 0.28), 0.018), FUDGE);
  vec3 q = p; q.x -= 0.035 * (q.y + 0.2);      // contrapposto: the weight on one hip
  float chest = sdEll(q - vec3(0.0, 0.17, 0.0), vec3(0.33, 0.27, 0.2));
  float pecL = sdEll(q - vec3(-0.14, 0.19, 0.08), vec3(0.15, 0.11, 0.1));
  float pecR = sdEll(q - vec3(0.14, 0.19, 0.08), vec3(0.15, 0.11, 0.1));
  float abd = sdEll(q - vec3(0.0, -0.1, 0.03), vec3(0.24, 0.27, 0.17));
  float hips = sdEll(q - vec3(0.02, -0.36, 0.0), vec3(0.31, 0.17, 0.2));
  float thL = sdCap(q, vec3(-0.15, -0.4, 0.02), vec3(-0.17, -0.56, 0.04), 0.13);
  float thR = sdCap(q, vec3(0.16, -0.4, 0.02), vec3(0.19, -0.56, 0.0), 0.13);
  float delL = sdEll(q - vec3(-0.33, 0.29, 0.0), vec3(0.12, 0.12, 0.12));
  float delR = sdEll(q - vec3(0.33, 0.29, 0.0), vec3(0.12, 0.12, 0.12));
  float neck = sdCap(q, vec3(0.0, 0.36, 0.0), vec3(0.0, 0.5, 0.02), 0.078);
  float armL = sdCap(q, vec3(-0.38, 0.28, 0.0), vec3(-0.45, 0.0, 0.04), 0.074);
  float foreL = sdCap(q, vec3(-0.45, 0.0, 0.04), vec3(-0.44, -0.2, 0.12), 0.06);
  float body = smin(smin(chest, abd, 0.12), hips, 0.1);
  body = smin(body, min(pecL, pecR), 0.06);
  body = smin(body, min(thL, thR), 0.08);
  body = smin(body, min(delL, delR), 0.07);
  body = smin(body, neck, 0.05);
  body = smin(body, min(armL, foreL), 0.04);
  body = max(body, -0.55 - p.y);
  float drape = (p.y < -0.28 && uPaint > 0.5) ? 1.0 : 0.0;
  r = U(r, vec2(body, drape > 0.5 ? FUDGE : CREAM));
  float back = uRestore;
  if (back > 0.01) {
    float m = uPaint > 0.5 ? CREAM : BRASS;
    float off = 1.0 - back;
    float head = sdEll(q - vec3(0.0, 0.66 + off * 0.3, 0.03), vec3(0.13, 0.165, 0.145) * back);
    vec3 so = vec3(0.3, 0.0, 0.0) * off;
    float armR = min(sdCap(q, vec3(0.38, 0.28, 0.0) + so, vec3(0.46, 0.0, 0.04) + so, 0.074 * back), sdCap(q, vec3(0.46, 0.0, 0.04) + so, vec3(0.47, -0.22, 0.08) + so, 0.06 * back));
    vec3 ho = vec3(0.0, -0.3, 0.0) * off;
    float hand = sdEll(q - vec3(-0.44, -0.27, 0.13) - ho, vec3(0.05, 0.075, 0.035) * back);
    r = U(r, vec2(min(head, min(armR, hand)), m));
  }
  return r;
}

// ---------- VII. training and product: a gear train, exploded; holding assembles it one part at a time ----------
float gear(vec3 q, float R, float teeth, float th) {
  float r = length(q.xz), a = atan(q.z, q.x);
  float t = R + 0.045 * smoothstep(-0.3, 0.3, sin(a * teeth));
  float d = max(r - t, abs(q.y) - th);
  return max(d, -(r - R * 0.3)) * 0.75;
}
vec2 sGears(vec3 p) {
  float e0 = 1.0 - smoothstep(0.0, 1.0, uParts), e1 = 1.0 - smoothstep(1.0, 2.0, uParts), e2 = 1.0 - smoothstep(2.0, 3.0, uParts), e3 = 1.0 - smoothstep(3.0, 4.0, uParts);
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.69, 0.0), vec3(0.8, 0.05, 0.5), 0.02), DEEP);
  float axle = sdCyl(p - vec3(-0.2, -0.43 + e0 * 0.14, 0.0), 0.055, 0.22);
  r = U(r, vec2(axle, FUDGE));
  vec3 g1 = p - vec3(-0.2, -0.52 + e1 * 0.46, 0.0); g1.xz = rot(uSpin) * g1.xz;
  r = U(r, vec2(gear(g1, 0.4, 14.0, 0.06), FUDGE));
  vec3 g2 = p - vec3(0.44 + e2 * 0.24, -0.52 + e2 * 0.28, 0.0); g2.xz = rot(-uSpin * 1.8 + 0.11) * g2.xz;
  r = U(r, vec2(gear(g2, 0.22, 8.0, 0.06), CREAM));
  float knob = sdCyl(p - vec3(-0.2, -0.36 + e3 * 0.66, 0.0), 0.13, 0.055) - 0.015;
  r = U(r, vec2(knob, CREAM));
  return r;
}

// ---------- the eighth world: up to six primitives on a plinth ----------
vec2 sSketch(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.69, 0.0), vec3(0.62, 0.05, 0.42), 0.02), DEEP);
  float d = 1e3; float m = FUDGE;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uSkN) continue;
    vec3 q = uSkM[i] * (p - uSkP[i]);
    vec3 s = uSkS[i];
    float t = uSkT[i], e;
    if (t < 0.5) e = sdRBox(q, s, min(0.03, min(s.x, min(s.y, s.z)) * 0.3));
    else if (t < 1.5) e = length(q) - s.x;
    else if (t < 2.5) e = sdCyl(q, s.x, s.y) - 0.01;
    else if (t < 3.5) e = sdTorus(q, vec2(s.x, max(0.04, s.y * 0.35)));
    else if (t < 4.5) e = sdCone(q, s.x, s.y);
    else e = sdRBox(q, vec3(s.x, 0.025, s.z), 0.01);
    if (e < d) m = mod(float(i), 2.0) < 0.5 ? FUDGE : CREAM;
    d = smin(d, e, 0.03);
  }
  return U(r, vec2(d, m));
}

// ---------- the niches' own worlds (pages only; the homepage keeps its seven) ----------
// real estate: a house of stacked volumes, chocolate below and vanilla above; holding turns the lights on
vec2 sHouse(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.69, 0.0), vec3(0.72, 0.05, 0.5), 0.02), DEEP);
  float low = sdRBox(p - vec3(-0.12, -0.39, 0.0), vec3(0.44, 0.26, 0.32), 0.012);
  float up = sdRBox(p - vec3(0.14, 0.04, 0.06), vec3(0.44, 0.17, 0.3), 0.012);
  // windows: shallow recesses, their backs lit when held
  vec3 w1 = p - vec3(-0.12, -0.39, 0.33); w1.x = mod(w1.x + 0.11, 0.22) - 0.11;
  float win1 = max(sdBox(w1, vec3(0.07, 0.13, 0.06)), abs(p.x + 0.12) - 0.4);
  vec3 w2 = p - vec3(0.14, 0.04, 0.37); w2.x = mod(w2.x + 0.13, 0.26) - 0.13;
  float win2 = max(sdBox(w2, vec3(0.1, 0.08, 0.06)), abs(p.x - 0.14) - 0.4);
  low = max(low, -win1); up = max(up, -win2);
  r = U(r, vec2(low, FUDGE)); r = U(r, vec2(up, CREAM));
  float glass = min(sdBox(p - vec3(-0.12, -0.39, 0.29), vec3(0.4, 0.13, 0.012)), sdBox(p - vec3(0.14, 0.04, 0.33), vec3(0.4, 0.08, 0.012)));
  r = U(r, vec2(glass, uExtra > 0.5 ? BRASS : DEEP));
  float balcony = sdRBox(p - vec3(0.38, -0.14, 0.42), vec3(0.2, 0.012, 0.1), 0.006);
  balcony = min(balcony, sdRBox(p - vec3(0.38, -0.08, 0.51), vec3(0.2, 0.05, 0.006), 0.004));
  return U(r, vec2(balcony, CREAM));
}
// tourism: a lighthouse, banded in the two tones; holding turns its lantern up (brass is light)
vec2 sLighthouse(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.69, 0.0), vec3(0.46, 0.05, 0.46), 0.03), DEEP);
  float tower = sdRCone(p - vec3(0.0, -0.64, 0.0), 0.27, 0.15, 0.94);
  float band = mod(floor((p.y + 0.64) / 0.188), 2.0);
  r = U(r, vec2(tower, band < 0.5 ? FUDGE : CREAM));
  r = U(r, vec2(sdCyl(p - vec3(0.0, 0.33, 0.0), 0.22, 0.022) - 0.006, FUDGE));
  r = U(r, vec2(sdCyl(p - vec3(0.0, 0.43, 0.0), 0.115, 0.08), BRASS));
  r = U(r, vec2(sdCone(p - vec3(0.0, 0.6, 0.0), 0.16, 0.09), FUDGE));
  return r;
}
// education: a desk globe on a stand, tilted to the earth's axis; holding spins it
float continents(vec3 d) {
  float a = sin(3.1 * d.x + 1.3) * sin(2.7 * d.y + 0.4) * sin(3.4 * d.z + 2.1) + 0.45 * sin(6.3 * d.x - 1.1 + 2.0 * d.z) * sin(5.7 * d.y + 0.8);
  return a;
}
vec2 sGlobe(vec3 p) {
  vec2 r = vec2(sdCyl(p - vec3(0.0, -0.7, 0.0), 0.3, 0.04) - 0.01, DEEP);
  r = U(r, vec2(sdCap(p, vec3(0.0, -0.66, 0.0), vec3(0.0, -0.36, 0.0), 0.035), FUDGE));
  vec3 c = p - vec3(0.0, 0.08, 0.0);
  vec3 t = c; t.xy = rot(0.41) * t.xy;                         // the axis tilt
  float ring = max(abs(length(t.xy) - 0.5) - 0.018, abs(t.z) - 0.022);
  ring = max(ring, -t.x - 0.08);                                // a half meridian, holding the globe from one side
  r = U(r, vec2(ring, CREAM));
  vec3 g = t; g.xz = rot(uSpin) * g.xz;
  float ball = length(c) - 0.44;
  float land = continents(normalize(g));
  return U(r, vec2(ball, land > 0.12 ? CREAM : FUDGE));
}
// gaming and entertainment: an arcade cabinet; holding lights the screen and the buttons
vec2 sArcade(vec3 p) {
  vec2 r = vec2(sdRBox(p - vec3(0.0, -0.69, 0.0), vec3(0.5, 0.05, 0.42), 0.02), DEEP);
  float body = sdRBox(p - vec3(0.0, -0.3, -0.04), vec3(0.3, 0.34, 0.22), 0.015);
  float deck = sdRBox(p - vec3(0.0, 0.08, 0.06), vec3(0.3, 0.04, 0.22), 0.012);
  float head = sdRBox(p - vec3(0.0, 0.42, -0.1), vec3(0.3, 0.3, 0.16), 0.015);
  head = max(head, dot(p - vec3(0.0, 0.3, 0.06), normalize(vec3(0.0, -0.32, 1.0))));   // the screen leans back
  float marquee = sdRBox(p - vec3(0.0, 0.68, -0.04), vec3(0.3, 0.06, 0.12), 0.012);
  r = U(r, vec2(min(body, head), FUDGE));
  r = U(r, vec2(min(deck, marquee), CREAM));
  float screen = max(sdBox(p - vec3(0.0, 0.38, 0.0), vec3(0.23, 0.17, 0.2)), abs(dot(p - vec3(0.0, 0.3, 0.055), normalize(vec3(0.0, -0.32, 1.0)))) - 0.008);
  r = U(r, vec2(screen, uExtra > 0.5 ? BRASS : DEEP));
  float stick = min(sdCap(p, vec3(-0.12, 0.12, 0.14), vec3(-0.12, 0.22, 0.14), 0.016), length(p - vec3(-0.12, 0.24, 0.14)) - 0.04);
  r = U(r, vec2(stick, CREAM));
  vec3 b = p - vec3(0.08, 0.12, 0.14); b.x = mod(b.x + 0.055, 0.11) - 0.055;
  float buttons = max(sdCyl(b, 0.03, 0.012), abs(p.x - 0.135) - 0.11);
  return U(r, vec2(buttons, uExtra > 0.5 ? BRASS : CREAM));
}

vec2 shape(float id, vec3 p) {
  if (id < 1.5) return sRetail(p);
  if (id < 2.5) return sCarton(p);
  if (id < 3.5) return sHeart(p);
  if (id < 4.5) return sStadium(p);
  if (id < 5.5) return sEvents(p);
  if (id < 6.5) return sTorso(p);
  if (id < 7.5) return sGears(p);
  if (id > 12.5) return sArcade(p);
  if (id > 11.5) return sGlobe(p);
  if (id > 10.5) return sLighthouse(p);
  if (id > 9.5) return sHouse(p);
  return sSketch(p);
}

// ---------- the stack: twenty-six slabs, each one the world's outline where it sits ----------
// stack space has the stack along y; for a scan from front to back (medicine) the stack runs along z
vec3 swz(vec3 p) { return uAxis > 0.5 ? vec3(p.x, p.z, p.y) : p; }
float gYLo, gPitch, gPitchW, gHalf, gSp, gR, gTop, gVY, gTint = 1.0, gWide = 0.0, gBox = 0.0, gFall = 0.0, gProxy = 0.0, gFar = 0.0, gSolid = 0.0, gDrop, gSinkD, gFloorY;
void setup() {
  float gm = smoothstep(0.0, 1.0, uMorph);
  gYLo = mix(uRange.x, uRange.z, gm);
  float yHi = mix(uRange.y, uRange.w, gm);
  gPitch = (yHi - gYLo) / NS;
  gPitchW = (uRange.w - uRange.z) / NS;
  gHalf = max(0.003, 0.5 * gPitch - 0.5 * uGap);
  gSp = gPitch + uSpread;
  gR = min(0.009, gHalf * 0.42);
  gTop = gYLo + NS * gSp + 0.05;
  gVY = HB - NV * (2.0 * HB / NS);
  // opened, the box sinks into the page (its floor and the walls' hinges go under the paper), so the world, risen, stands on
  // the paper itself; until then it stands on the box's floor (TH above the paper)
  // (the box goes well under: a ray's hit tolerance, far from the camera, is as large as a sliver of paper; the world settles
  // just into the page, so it stands on it with no seam)
  gSinkD = (TH + 0.06) * uSink;
  float wSink = min(gSinkD, TH + 0.014);     // the world follows the floor down, and stops just into the paper
  gFloorY = -HB + TH - wSink;
  gDrop = uDrop * (1.0 - uRiseW) - TH + wSink;
}
// slab by slab, from the bottom up, like a print: each slab turns in a quarter of the time
float rawMorph(float k) { return clamp(uMorph * 4.0 - 3.0 * (k / (NS - 1.0)), 0.0, 1.0); }
float morphOf(float k) { float m = rawMorph(k); return m * m * (3.0 - 2.0 * m); }
float hideOf(float yw) { return uHideAmt * smoothstep(0.0, 0.05, yw - uHide); }
// hand-stacked: each slab sits a hair off true, and no two are quite the same brown
float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec2 section(float k, vec3 s) {
  s.xz -= (vec2(h1(k), h1(k + 41.0)) - 0.5) * 0.007;
  float mk = morphOf(k);
  float sq = sdBox2(s.xz, vec2(HB - 0.022)) - 0.022;
  if (mk <= 0.0) return vec2(sq, 0.0);
  float yw = uRange.z + (k + 0.5) * gPitchW;
  vec2 w = shape(uW, swz(vec3(s.x, yw, s.z)));
  return vec2(mix(sq, w.x, mk) + hideOf(yw) * 0.9, w.y);
}
float extrude(float sec, float dy, float h, float r) {
  vec2 w = vec2(sec + r, dy - h + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}
float slabCentre(float k) { return gYLo + (k + 0.5) * gPitch + k * uSpread; }
float slab(float k, vec3 s) { return extrude(section(k, s).x, abs(s.y - slabCentre(k)), gHalf, gR); }
float nearestK(float y) { return clamp(floor((y - gYLo - 0.5 * gPitch) / gSp + 0.5), 0.0, NS - 1.0); }
// the world's own distance, unsliced: when a world stands still and unspread, every slab is at least half of it (less a slab
// and the stacking slop) away, which lets rays cross empty space quickly
float farBound(vec3 s) { return (uMorph >= 1.0 && uSpread <= 0.0) ? (shape(uW, swz(s)).x - gHalf - 0.006) * 0.5 : 0.0; }
float stack(vec3 p) {
  vec3 s = swz(p);
  float k0 = nearestK(s.y);
  // the nearest slab and its neighbour on this side; any other slab is at least a spacing less a half-thickness away
  float k1 = clamp(k0 + (s.y > slabCentre(k0) ? 1.0 : -1.0), 0.0, NS - 1.0);
  float d = min(slab(k0, s), slab(k1, s));
  float bnd = max(gSp - gHalf, farBound(s));     // a safe step past the other slabs, not a distance to them
  gFar = float(bnd < d);
  return min(d, bnd);
}
// for soft shadows, a world at rest can cast the shadow of its unsliced self: the same shape, a fraction of the work
float stackFast(vec3 p) {
  // on the paper a world casts the shadow of its solid self, stretched as far as its slices are spread (light through the gaps
  // between slices drew stripes, and the stack's safe step, with no far bound while spread, drew fans of dashes)
  if (gSolid > 0.5 && uMorph >= 1.0) {
    vec3 s = swz(p);
    float f = gPitch / gSp, b = gYLo + 0.5 * gPitch;
    s.y = b + (s.y - b) * f;
    return shape(uW, swz(s)).x * f + gR;
  }
  if (uMorph >= 1.0 && uSpread <= 0.0 && uHideAmt <= 0.001) return shape(uW, p).x + gR;
  return stack(p);
}
// ---------- the box: a floor, four walls hinged at their feet, and the vanilla lid ----------
// closed, it is the block: chocolate all over, with a light inside. Opening, the lid lifts away, the walls fold down flat onto
// the paper with their vanilla lining up, and the world rises out of the floor through the light
// a point in the frame of the wall on side k (0 front +z, 1 right +x, 2 back -z, 3 left -x), folded down by a (0 standing,
// pi/2 flat): y runs up the wall from its foot, z through it (outer face at 0, inner face at -TH)
vec3 wallFrame(vec3 p, float k, float a) {
  vec3 q = k < 0.5 ? p : k < 1.5 ? vec3(-p.z, p.y, p.x) : k < 2.5 ? vec3(-p.x, p.y, -p.z) : vec3(p.z, p.y, -p.x);
  q -= vec3(0.0, -HB - gSinkD, HB);
  float c = cos(a), s = sin(a);
  q = vec3(q.x, q.y * c + q.z * s, -q.y * s + q.z * c);
  // fudge is soft: as a wall falls open it curls outward along its height, like a petal, and lies straight again flat
  float cu = k < 0.5 ? uCurl.x : k < 1.5 ? uCurl.y : k < 2.5 ? uCurl.z : uCurl.w;
  if (cu > 0.0005 && q.y > 0.0) q.yz = rot(-cu * q.y) * q.yz;
  return q;
}
float wallAt(vec3 p, float k, float a) {
  vec3 q = wallFrame(p, k, a);
  float hw = (k < 0.5 || (k > 1.5 && k < 2.5)) ? HB : HB - TH;
  float cu = k < 0.5 ? uCurl.x : k < 1.5 ? uCurl.y : k < 2.5 ? uCurl.z : uCurl.w;
  return sdRBox(q - vec3(0.0, 0.5 * (gVY + HB), -0.5 * TH), vec3(hw, 0.5 * (gVY + HB), 0.5 * TH), 0.012) * (cu > 0.0005 ? 0.8 : 1.0);   // (bent, the distance is only nearly true)
}
// the lid breathes (a crack of light), then lifts away: it turns a little and drifts back, tipping about its back edge, as if
// a hand had taken it off
vec3 lidFrame(vec3 p) {
  p -= vec3(0.0, 0.0, uLidMove.y);
  p.xz = rot(uLidMove.x) * p.xz;
  vec3 q = p - vec3(0.0, uLidY + gVY, -HB);
  q.yz = rot(uLidTilt) * q.yz;
  return q + vec3(0.0, gVY, -HB);
}
float lidAt(vec3 p) { vec3 q = lidFrame(p); return sdRBox(q - vec3(0.0, 0.5 * (gVY + HB), 0.0), vec3(HB, 0.5 * (HB - gVY) - 0.002, HB), 0.022); }
float floorAt(vec3 p) { return sdRBox(p - vec3(0.0, -HB + 0.5 * TH - gSinkD, 0.0), vec3(HB - TH, 0.5 * TH, HB - TH), 0.006); }
float boxD(vec3 p) {
  float d = min(floorAt(p), min(min(wallAt(p, 0.0, uWalls.x), wallAt(p, 1.0, uWalls.y)), min(wallAt(p, 2.0, uWalls.z), wallAt(p, 3.0, uWalls.w))));
  if (uLidY < 3.0) d = min(d, lidAt(p));
  return d;
}
// the world, risen as far as it has; nothing of it shows below the box's floor (it rises up through it, and what a world keeps
// out of sight, like the stock under the shelf, stays there)
float worldD(vec3 p) { return max(stack(p + vec3(0.0, gDrop, 0.0)), gFloorY - p.y); }
float worldS(vec3 p) { float a = stackFast(p + vec3(0.0, gDrop, 0.0)), b = gFloorY - p.y; if (b > a) gFar = 0.0; return max(a, b); }
// outside the world's own box, the distance to that box is a safe step (and far cheaper than the slabs)
float worldBox(vec3 p) { return sdBox(p - 0.5 * (uWMin + uWMax), 0.5 * (uWMax - uWMin)); }
float map(vec3 p) { float d = boxD(p); if (uRiseW > 0.0) { float wb = worldBox(p); d = min(d, wb > 0.02 ? wb : worldD(p)); } return d; }
// (soft shadows read every small distance as a near miss, so for them the box only stands in for the world well away from it)
// for shadows, a wall that has melted into the page casts none
float boxDS(vec3 p) {
  float d = uSink < 0.98 ? floorAt(p) : 1e3;     // (sunk under the page, the floor shades nothing)
  if (uWalls.x < 1.3) d = min(d, wallAt(p, 0.0, uWalls.x));
  if (uWalls.y < 1.3) d = min(d, wallAt(p, 1.0, uWalls.y));
  if (uWalls.z < 1.3) d = min(d, wallAt(p, 2.0, uWalls.z));
  if (uWalls.w < 1.3) d = min(d, wallAt(p, 3.0, uWalls.w));
  if (uLidY < 3.0) d = min(d, lidAt(p));
  return d;
}
float mapS(vec3 p) {
  float d = boxDS(p);
  gProxy = 0.0; gFar = 0.0;
  if (uRiseW > 0.0) {
    float wb = worldBox(p);
    if (wb > 0.3) { gProxy = float(wb < d); d = min(d, wb); }
    else { float w = worldS(p); if (w < d) d = w; else gFar = 0.0; }
  }
  return d;
}
// what is at a surface point: two tones and how far between them, and any brass light
vec4 info(vec3 p) {
  // which part is nearest (by distance, not by a threshold: a ray stops a few thousandths short of the surface)
  float dl = uLidY < 3.0 ? lidAt(p) : 1e3, df = floorAt(p);
  float dwall = 1e3, kb = 0.0, ab = 0.0;
  for (int k = 0; k < 4; k++) {
    float ak = k == 0 ? uWalls.x : k == 1 ? uWalls.y : k == 2 ? uWalls.z : uWalls.w;
    float d = wallAt(p, float(k), ak);
    if (d < dwall) { dwall = d; kb = float(k); ab = ak; }
  }
  float db = min(dl, min(df, dwall)), dw = uRiseW > 0.0 ? worldD(p) : 1e3;
  if (db <= dw + 0.002) {      // on a near-tie (the floor, while the world is still under it) it is the box
    gTint = 1.0;
    float m = FUDGE, lining = 0.0;
    gFall = 0.0;
    if (dl <= min(df, dwall)) {
      lining = step(lidFrame(p).y - gVY, 0.004);                       // the lid: chocolate, its underside lined
    } else if (df <= dwall) {
      lining = step(-HB + TH - gSinkD - 0.006, p.y);                   // the floor: lined on top, chocolate below
    } else {
      lining = step(wallFrame(p, kb, ab).z, -0.7 * TH);                // a wall: chocolate outside, lined inside
      gFall = smoothstep(1.15, 1.5, ab);                                // nearly flat, its chocolate face turned away, it melts into the page
    }
    // the lining is a vanilla a shade deeper than the paper, so the opened box lies on the page and only just shows
    m = lining > 0.5 ? CREAM : FUDGE; gTint = mix(1.0, 1.06, lining); gWide = lining; gBox = 1.0;
    return vec4(m, m, 0.0, 0.0);
  }
  vec3 s = swz(p + vec3(0.0, gDrop, 0.0));
  float k = nearestK(s.y);
  float best = 1e3, bk = k;
  for (int j = -1; j <= 1; j++) {
    float kk = clamp(k + float(j), 0.0, NS - 1.0);
    float d = slab(kk, s);
    if (d < best) { best = d; bk = kk; }
  }
  vec2 sec = section(bk, s);
  float yw = uRange.z + (bk + 0.5) * gPitchW;
  gTint = 0.93 + 0.14 * h1(bk + 7.0); gWide = 0.0; gBox = 0.0;
  // the scan: the last slice still standing is outlined in light, its edge and its chambers
  float glow = uHideAmt * step(yw, uHide) * (1.0 - smoothstep(0.0, gPitchW * 1.2, uHide - yw));
  glow *= smoothstep(-gHalf * 0.3, gHalf, s.y - slabCentre(bk)) * (1.0 - smoothstep(0.004, 0.022, abs(sec.x)));
  // the lighthouse's lantern, turned up by the hold
  if (uW > 10.5 && uW < 11.5) { vec3 lq = p + vec3(0.0, gDrop, 0.0); glow += uExtra * 1.3 * step(abs(lq.y - 0.43), 0.085) * step(length(lq.xz), 0.13); }
  // (no line of light where the world crosses the paper: the warm pool marks it, and a thin floor that passed through the
  // band lit up whole)
  return vec4(FUDGE, sec.y, 1.0, glow);
}

// ---------- light ----------
float shadow(vec3 ro, vec3 rd, float maxT, float k) {
  // soft shadow that remembers the last step (after Inigo Quilez), so penumbras come out smooth instead of banded;
  // a different start for every pixel and averaged frame turns what banding is left into grain that averages away
  float res = 1.0, ph = 1e10;
  // (interleaved gradient noise, after Jimenez: no pattern of its own, and it averages out over the jittered frames)
  vec2 jp = gl_FragCoord.xy + uJit * 37.0;
  float ign = fract(52.9829189 * fract(dot(jp, vec2(0.06711056, 0.00583715))));
  float t = 0.01 + (k < 5.0 ? 0.12 : 0.04) * ign;     // the paper's soft shadow takes a wider spread of starts, or its steps band
  float nMax = k < 5.0 ? uShadowSteps + 8.0 : uShadowSteps;   // the paper's shadow is the solid shape: cheap steps, so a few more (38 on desktop, 26 on phones)
  for (int i = 0; i < 40; i++) {
    if (float(i) >= nMax) break;
    float h = mapS(ro + rd * t);
    // the world's box, and the slab stack's safe step past its farther slabs, are only there to step by: what they stand in
    // for is further away, so they draw no penumbra (on paper, with its soft shadows, they drew grey plates)
    float hq = max(gProxy, gFar) > 0.5 ? max(h, 1.0) : h;
    float y = hq < ph ? hq * hq / (2.0 * ph) : 0.0, d = sqrt(max(hq * hq - y * y, 0.0));   // only when closing in; a jump up is not a shadow
    // (the paper's soft shadow takes the plain estimate: the refined one rings round stepped shapes like the stadium's tiers)
    res = min(res, k < 5.0 ? k * hq / t : k * d / max(0.0001, t - y));
    ph = hq;
    t += clamp(h, 0.01, k < 5.0 ? 0.09 : 0.16);
    if (res < 0.002 || t > maxT) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
float occl(vec3 p, vec3 n) {
  float o = 0.0, w = 1.0;
  for (int i = 1; i <= 3; i++) { float h = 0.025 * float(i); o += w * (h - map(p + n * h)); w *= 0.6; }
  return clamp(1.0 - 3.6 * o, 0.0, 1.0);
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0008, -0.0008);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// value noise with its gradient (after Inigo Quilez)
vec4 noised(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash3(i), b = hash3(i + vec3(1, 0, 0)), c = hash3(i + vec3(0, 1, 0)), d = hash3(i + vec3(1, 1, 0));
  float e = hash3(i + vec3(0, 0, 1)), f1 = hash3(i + vec3(1, 0, 1)), g = hash3(i + vec3(0, 1, 1)), h = hash3(i + vec3(1, 1, 1));
  float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f1, k7 = -a + b + c - d + e - f1 - g + h;
  return vec4(k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
}
vec3 albedo(float m) {
  if (m < 0.5) return vec3(0.036, 0.0185, 0.011);    // chocolate fudge
  if (m < 1.5) return vec3(0.55, 0.46, 0.32);        // vanilla fudge
  if (m < 2.5) return vec3(0.0);                     // brass is light, not paint
  return vec3(0.04, 0.019, 0.011);                   // the darker plinth fudge
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// the light inside, spilled onto the page: how much reaches a point on the paper (or on a wall's lining lying there), past
// whichever wall stands between it and the box: none while that wall stands, all of it once the wall lies flat
float spill(vec3 po) {
  vec2 q = abs(po.xz);
  float ax = po.x > 0.0 ? uWalls.y : uWalls.w, az = po.z > 0.0 ? uWalls.x : uWalls.z;
  float a = mix(az, ax, smoothstep(-0.35, 0.35, q.x - q.y));     // across a corner the two walls share it, without a seam
  float past = mix(1.0, smoothstep(0.1, 1.3, a), smoothstep(HB - 0.2, HB + 0.1, max(q.x, q.y)));
  return past * exp(-1.5 * max(length(po.xz) - 0.45, 0.0));       // round, like light, not the box's square
}
const vec3 SPILL = vec3(1.0, 0.8, 0.52);     // brass light on paper: the page can't get brighter, so it warms

void main() {
  setup();
  vec2 frag = gl_FragCoord.xy + uJit - 0.5 * uRes - uShift;
  vec2 uv = frag / uRes.y;
  vec3 ro = uCam;
  vec3 ww = normalize(uTarget - ro), uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + uFocal * ww);
  vec3 roO = uRot * ro, rdO = uRot * rd;
  vec3 col = uBg;    // the paper, already in display space: it is never tone mapped, so it matches the page exactly
  // the object's box: most pixels never touch it
  vec3 bmin = uBMin, bmax = uBMax;
  vec3 inv = 1.0 / rdO, t0 = (bmin - roO) * inv, t1 = (bmax - roO) * inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
  float hit = -1.0;
  float tPaper = rd.y < 0.0 ? (FLOOR - ro.y) / rd.y : 1e5;     // nothing under the page is ever seen (the sunk box, the world below)
  if (tf > max(tn, 0.0)) {
    float t = max(tn, 0.0);
    for (int i = 0; i < 180; i++) {
      if (float(i) >= uSteps) break;
      float d = map(roO + rdO * t);
      if (d < 0.0004 * t) { hit = t; break; }
      t += d * 0.9;
      if (t > tf || t > tPaper) break;
    }
  }
  vec3 keyP = uKey;
  // the floor is the page: paper, with the object's soft shadow on it and a darker touch where it meets the paper
  if (rd.y < 0.0) {
    float tfl = (FLOOR - ro.y) / rd.y;
    if (hit < 0.0 || tfl < hit) {
      vec3 pw = ro + rd * tfl;
      vec3 L = keyP - pw; L = normalize(L);
      vec3 po = uRot * pw;
      // a shadow can only fall where the ray toward the key passes over the object's box
      // (widened by how far the paper's soft penumbra reaches past what casts it, or the box's edges cut it off straight)
      vec3 sb0 = (uFlat > 0.5 && uRiseW > 0.0 ? uWMin : bmin) - vec3(0.45, 0.0, 0.45), sb1 = (uFlat > 0.5 && uRiseW > 0.0 ? uWMax : bmax) + vec3(0.45);
      vec3 lo = uRot * L, ib = 1.0 / lo, a0 = (sb0 - po) * ib, a1 = (sb1 - po) * ib;
      float sn = max(max(min(a0.x, a1.x), min(a0.y, a1.y)), min(a0.z, a1.z)), sf = min(min(max(a0.x, a1.x), max(a0.y, a1.y)), max(a0.z, a1.z));
      // on the paper a world casts the shadow of its solid self: light through the gaps between its slices drew stripes
      gSolid = 1.0;
      float sh = sf > max(sn, 0.0) ? shadow(po + vec3(0.0, 0.03, 0.0), lo, sf + 0.05, 4.2) : 1.0;   // (from just above the paper: where a world meets it, the contact term below darkens it, and a grazing start drew a fan of lines)
      float near = 1.0;
      if (length(max(max(bmin - po, po - bmax), 0.0)) <= 0.08) { near = clamp(mapS(po + vec3(0.0, 0.06, 0.0)) / 0.06, 0.0, 1.0); if (max(gProxy, gFar) > 0.5) near = 1.0; }
      near = max(near, smoothstep(1.2, 2.0, length(po.xz)));    // where the opened walls fade into the paper, so does their edge on it
      // as the box goes under, only the world still touches the paper
      float melt = max(smoothstep(0.0, 0.6, uSink), smoothstep(1.15, 1.5, min(min(uWalls.x, uWalls.y), min(uWalls.z, uWalls.w))));
      if (melt > 0.0 && near < 1.0) {
        gFar = 0.0;
        float nw = uRiseW > 0.0 ? clamp(worldS(po + vec3(0.0, 0.06, 0.0)) / 0.06, 0.0, 1.0) : 1.0;
        if (gFar > 0.5) nw = 1.0;
        nw = mix(1.0, nw, smoothstep(0.9, 1.0, uRiseW));      // a world still passing through the paper doesn't touch it yet
        near = mix(near, nw, melt);
      }
      col = uBg * mix(vec3(0.84, 0.8, 0.75), vec3(1.0), sh) * mix(vec3(0.62, 0.57, 0.52), vec3(1.0), near);
      // the page takes the box as it sinks: one soft ring travels out through the paper, like cream settling, and is gone
      if (uRipple > 0.0 && uRipple < 1.0) {
        float r = length(po.xz), R = HB + 0.1 + 2.4 * uRipple, w = 0.13 + 0.12 * uRipple, x = (r - R) / w;
        float slope = -2.0 * x * exp(-x * x), amp = 0.075 * sin(3.14159 * uRipple) * (1.0 - 0.5 * uRipple);
        col *= 1.0 + amp * slope * dot(po.xz / max(r, 0.001), normalize(lo.xz + vec2(1e-4)));
      }
      // the light inside reaches the paper over each wall as that wall folds
      if (uInner > 0.001) col = mix(col, col * SPILL, 0.5 * uInner * spill(po));
    }
  }
  if (hit > 0.0) {
    vec3 pO = roO + rdO * hit;
    vec3 nO = normalAt(pO);
    vec4 inf = info(pO);
    float m = inf.z > 0.5 ? inf.y : inf.x;
    float isCreamFace = 0.0;
    vec3 al = mix(albedo(inf.x), albedo(inf.y), inf.z) * gTint;
    // the heart's slices read like slides: the cut faces are vanilla, the rims and the chambers' walls stay chocolate
    if (uAxis > 0.5 && uW > 2.5 && uW < 3.5 && inf.y < 0.5) {
      float face = smoothstep(0.75, 0.95, abs(nO.z));
      al = mix(al, albedo(CREAM) * 0.92, face * inf.z);
      isCreamFace = face * inf.z;
    }
    float isCream = mix(float(inf.x == CREAM), float(inf.y == CREAM), inf.z);
    float isBrass = float(m == BRASS) * step(0.5, inf.z);
    isCream = max(isCream, isCreamFace);
    // the grain of the fudge: a little mottling, fine sugar crystals you feel more than see
    vec3 tp = pO; tp.xz = rot(uTexYaw) * tp.xz;
    // (the finest noise, finer than a pixel, read as grain; the mottling is now from the broader scales only)
    vec4 n0 = noised(tp * 3.0), n1 = noised(tp * 9.0), n2 = noised(tp * 46.0);
    al *= 0.8 + 0.16 * n0.x + 0.2 * n1.x + 0.05 * (n2.x - 0.5);
    // the opened box's walls are wide and flat: quieter grain and a softer sheen there, or the sheen's edge draws contours
    float wide = max(float(m > 2.5), gWide);
    vec3 g = (n1.yzw * 0.02 + n2.yzw * 0.028) * mix(1.0, 0.35, wide);
    vec3 nb = normalize(nO - (g - dot(g, nO) * nO));
    // a few small pits, the air a knife finds in real fudge
    vec3 cp = tp * 17.0, ci = floor(cp);
    vec3 cf = fract(cp) - 0.5 - (vec3(hash3(ci), hash3(ci + 3.1), hash3(ci + 7.7)) - 0.5) * 0.5;
    float pit = step(0.972, hash3(ci + 11.0)) * (1.0 - smoothstep(0.05, 0.16, length(cf - dot(cf, nO) * nO)));
    pit *= 1.0 - 0.85 * isCream;                    // (on the vanilla, beside white paper, a pit reads as a speck of dirt)
    al *= 1.0 - 0.35 * pit;
    nb = normalize(nb - (cf - dot(cf, nO) * nO) * pit * 3.0);
    vec3 n = nb * uRot, ns = nO * uRot, p = pO * uRot, v = -rd;    // to world space
    vec3 L = normalize(keyP - p);
    // once the box lies open its walls can't shade anything, so for them only a ray that passes the world's box is traced
    float sh = 1.0;
    vec3 lO = uRot * L;
    if (uFlat > 0.5 && inf.z < 0.5) {
      vec3 ib = 1.0 / lO, a0 = (uWMin - pO) * ib, a1 = (uWMax - pO) * ib;
      float sn = max(max(min(a0.x, a1.x), min(a0.y, a1.y)), min(a0.z, a1.z)), sf = min(min(max(a0.x, a1.x), max(a0.y, a1.y)), max(a0.z, a1.z));
      if (uRiseW > 0.0 && sf > max(sn, 0.0)) sh = shadow(pO + nO * 0.004, lO, sf + 0.05, 8.0);
    } else sh = shadow(pO + nO * 0.004, lO, 4.0, 8.0);
    float ao = occl(pO, nO);
    float ndl = dot(n, L);
    float wrap = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);
    vec3 keyC = vec3(1.0, 0.9, 0.78) * 3.0;
    vec3 hv = normalize(L + v);
    float rough = mix(0.42, 0.56, isCream);
    float sp = 2.0 / (rough * rough * rough * rough) - 2.0;
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(hv, v), 0.0), 5.0);
    float spec = (sp + 8.0) / 25.13 * pow(max(dot(n, hv), 0.0), sp) * fres * max(ndl, 0.0);
    // sugar: a few crystals catch the key like sparks
    float cell = hash3(floor(tp * 260.0));
    float spark = step(0.994, cell) * pow(max(dot(n, hv), 0.0), 30.0) * 1.1 * step(0.0, ndl);
    // the sheen: two soft boxes seen in the surface, the key's and a strip behind on the right
    vec3 rf = reflect(-v, ns);
    vec3 rimL = normalize(vec3(1.4, 0.9, -2.2));
    float fv = 0.04 + 0.96 * pow(1.0 - max(dot(ns, v), 0.0), 5.0);
    float box1 = smoothstep(0.88, 0.995, dot(rf, L));
    float box2 = smoothstep(0.9, 0.995, dot(rf, rimL));
    vec3 sheen = (vec3(1.0, 0.8, 0.6) * box1 * 1.6 + vec3(0.95, 0.62, 0.3) * box2 * 0.8) * mix(fv * 1.2, fv * 0.5, isCream) * mix(1.0, sh, 0.7) * mix(1.0, 0.3, wide);
    vec3 diffuse = al * keyC * mix(max(ndl, 0.0), wrap, 0.35) * sh;
    vec3 specular = keyC * (spec * 0.8 + spark * (1.0 - isCream * 0.6)) * sh * 0.3;
    // the rim: a thin brass line where the edges turn away
    float rim = pow(1.0 - max(dot(ns, v), 0.0), 4.0) * max(dot(ns, rimL), 0.0);
    vec3 rimC = vec3(0.86, 0.52, 0.2) * rim * 0.6;
    // the room is light: a soft sky of paper above, and the paper's own bounce below
    vec3 amb = al * (vec3(0.98, 0.95, 0.88) * 0.6 * (0.5 + 0.5 * n.y) + vec3(0.98, 0.94, 0.86) * 0.32 * (0.5 - 0.5 * n.y)) * ao;
    // inside the standing walls the sky barely reaches, so there the light inside is what you see
    float shut = 1.0 - smoothstep(0.0, 1.2, 0.25 * (uWalls.x + uWalls.y + uWalls.z + uWalls.w));
    // (by soft ramps, not a hard edge: a wall folding outward crosses the box's footprint, and a hard edge drew a ragged line)
    float enclosed = shut * smoothstep(HB + 0.5, HB - 0.15, max(abs(pO.x), abs(pO.z))) * smoothstep(HB + 0.3, HB - 0.3, pO.y);
    // (only what faces in: a wall's outer face stands in the room's light, and lost half its sky to this ramp before)
    float facesIn = clamp(0.5 - 3.0 * dot(nO.xz, normalize(pO.xz + vec2(1e-4))), 0.0, 1.0);
    enclosed *= mix(facesIn, 1.0, smoothstep(0.6, 0.9, abs(nO.y)));
    amb *= 1.0 - 0.75 * enclosed;
    // a fill from the camera's right, as the white card beside a product shot gives: the shadow side keeps its chocolate
    // (about a quarter of the key, so the form still turns; none inside the closed box, where the light inside rules)
    vec3 Lf = normalize(vec3(2.4, 0.9, 2.2));
    vec3 fill = al * vec3(1.0, 0.95, 0.88) * uFill * max(dot(n, Lf), 0.0) * mix(1.0, ao, 0.7) * (1.0 - 0.85 * enclosed);
    col = diffuse * mix(1.0, ao, 0.5) + specular + sheen * ao + rimC * ao + amb + fill;
    // the light inside the block: it lights whatever faces it (the lining, the lid's underside, the world rising through it)
    if (uInner > 0.001) {
      vec3 Li = vec3(0.0, -HB + TH + 0.3, 0.0) - pO;
      float dI = length(Li);
      col += al * vec3(1.0, 0.56, 0.2) * uInner * 9.0 * max(dot(nO, Li / dI), 0.0) / (1.0 + 4.0 * dI * dI);
    }
    // brass light: the scan, the hot wire, and what returns before it is real
    col += vec3(1.0, 0.6, 0.22) * (inf.w * 2.6) + vec3(0.95, 0.6, 0.24) * isBrass * (0.36 + 0.36 * max(dot(n, v), 0.0));
    col = pow(aces(col), vec3(1.0 / 2.2));
    // the opened walls fade into the paper as they land, from just past the box's own size: the box all but becomes the page,
    // and nothing of it runs behind the verse (the closed box, and a wall still in the air, are never touched)
    // and, as the box goes under, whatever of it lies at the paper melts into the page as it touches it
    // and a wall, as it falls open past about seventy degrees, melts into the page before it lands: the box unfolds into the paper
    if (gBox > 0.5) col = mix(col, uBg, max(max(smoothstep(1.2, 2.0, length(pO.xz)) * smoothstep(-HB + 0.3, -HB + 0.08, pO.y),
                                            smoothstep(0.0, 0.6, uSink) * smoothstep(-HB + 0.16, -HB + 0.02, pO.y)), gFall));
    // the lining lying open on the page takes the spilled light as the paper does, so the pool runs over both as one
    // (only where it lies near the paper: standing, it takes the light inside directly)
    if (uInner > 0.001 && gWide > 0.5) col = mix(col, col * SPILL, 0.5 * uInner * spill(pO) * (1.0 - enclosed) * smoothstep(-HB + 0.4, -HB + 0.06, pO.y));
  }
  // the light inside, seen in the air: as the lid lifts, a soft shaft of it rises out of the box, finely rayed, and thins as it goes
  // (over the paper it can only warm the page; over the fudge it glows)
  if (uInner > 0.001) {
    float y0 = -HB + TH + 0.2, wM = HB + 0.45;      // from the light itself, so the box fills with it before it climbs out
    vec3 ia = 1.0 / rdO, s0 = (vec3(-wM, y0, -wM) - roO) * ia, s1 = (vec3(wM, HB + 2.4, wM) - roO) * ia;
    vec3 smn = min(s0, s1), smx = max(s0, s1);
    float ta = max(max(max(smn.x, smn.y), smn.z), 0.0), tb = min(min(min(smx.x, smx.y), smx.z), hit > 0.0 ? hit : tPaper);
    if (tb > ta) {
      // while the walls stand, the light is held to the mouth and thins only above it; once they fall it thins from the page up
      float yHold = mix(y0, HB - 0.1, 1.0 - smoothstep(0.2, 1.4, 0.25 * (uWalls.x + uWalls.y + uWalls.z + uWalls.w)));
      float acc = 0.0, dt = (tb - ta) / 10.0, j = hash3(vec3(gl_FragCoord.xy, 1.0 + uJit.x * 7.0 + uJit.y * 13.0));
      for (int i = 0; i < 10; i++) {
        vec3 q = roO + rdO * (ta + (float(i) + j) * dt);
        float h = q.y - y0, w = HB - 0.12 + 0.22 * max(q.y - HB, 0.0), a = atan(q.z, q.x);   // inside the walls, then opening out
        float rays = 0.6 + 0.24 * sin(a * 7.0 + 1.3) + 0.16 * sin(a * 17.0 + 4.1);
        acc += smoothstep(w + 0.05, w - 0.5, max(abs(q.x), abs(q.z))) * exp(-1.1 * max(q.y - yHold, 0.0)) * smoothstep(0.0, 0.15, h) * rays;
      }
      // (only once the lid is really off: a lid just cracked lets out a line of light, not a column above itself)
      float s = clamp(acc * dt * uInner * uShaft * smoothstep(0.08, 0.9, uLidY), 0.0, 1.0);
      col = mix(col, col * vec3(1.0, 0.82, 0.56), s);
      col = 1.0 - (1.0 - col) * (1.0 - vec3(1.0, 0.64, 0.28) * s * 0.6);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/* the last pass: the accumulated image, its edges smoothed (FXAA) while it is still a single sample, and a whisper of grain */
window.VFPresentShader = `
precision highp float;
uniform sampler2D uTex;
uniform float uGrain, uSeed, uAA;
uniform vec2 uPx;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 fxaa(vec2 uv) {
  const vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 nw = texture2D(uTex, uv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture2D(uTex, uv + vec2(1.0, -1.0) * uPx).rgb;
  vec3 sw = texture2D(uTex, uv + vec2(-1.0, 1.0) * uPx).rgb, se = texture2D(uTex, uv + vec2(1.0, 1.0) * uPx).rgb;
  vec3 m = texture2D(uTex, uv).rgb;
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (lmax - lmin < max(0.0312, lmax * 0.125)) return m;   // no edge here: leave the texture alone
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float reduce = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * uPx;
  vec3 a = 0.5 * (texture2D(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(uTex, uv - dir * 0.5).rgb + texture2D(uTex, uv + dir * 0.5).rgb);
  float lb = dot(b, L);
  return (lb < lmin || lb > lmax) ? a : b;
}
void main() {
  vec3 c = uAA > 0.5 ? fxaa(vUv) : texture2D(uTex, vUv).rgb;
  float g = hash(gl_FragCoord.xy + uSeed) + hash(gl_FragCoord.xy * 1.7 + uSeed * 0.37) - 1.0;
  c += g * uGrain * (0.35 + 0.65 * (1.0 - dot(c, vec3(0.333))));
  gl_FragColor = vec4(c, 1.0);
}
`;
