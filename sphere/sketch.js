// === Energy Sphere (2D-only, ANCHORED) + HALO SPARKS (outer ring) ===
// Outer (green) now deforms more with audio.
// - Treble: modest growth + brightness
// - Mid (+ a bit of Bass/Treble): non-spherical deformation
// - Bass: slight global spin
// - Sparks: spawn in a padded ring outside the sphere, fade outward, drawn BEFORE the sphere

// ------------------------ State ------------------------
let inner = [],
  outer = []
let R_IN = 70,
  R_OUT = 220
const N_IN = 450
const N_OUT = 1600

// ---- OSC (from bridge via Processing → /uv/eq [bass, mid, tre])
let socket
let oscBass = 0,
  oscMid = 0,
  oscTreble = 0

// ---- Dynamics (moderate so the base sphere stays readable)
const FLOW_OUT = 0.32
const FLOW_IN = 0.18
const SPRING_K = 0.015
const VMAX = 0.5
const JITTER_R = 0.5 // small radial roughness (cleaner sphere)

// ---- Global rotation
let SPIN_Y = 0.01
const SPIN_Z = 0.006

// ---- Projection
let FOV = 420

// ---- Trails fade (higher = fewer trails, clearer base)
const FADE = 48

// ------- Deformation gains (tune here) -------
const DEFORM_GAIN_OUT = 0.32 // outer (green) deformation gain (↑ to deform more)
const DEFORM_GAIN_IN = 0.1 // inner (red) stable
const DEFORM_BASS_MIX = 0.12 // bass influence on deformation
const DEFORM_TREB_MIX = 0.08 // treble influence on deformation

// ---------------- HALO SPARKS (outer ring, with padding) ----------------
// Particles appear in a ring OUTSIDE the sphere and move outward with slight curl.
// Drawn BEFORE the sphere so deformation is always visible.
const HALO_SPARKS_MAX = 800
const HALO_ENERGY_GATE = 0.2 // require some real energy
const HALO_BASE_PER_FRAME = 40 // base emission (scaled by energy)
const HALO_SIZE_MIN = 2.2
const HALO_SIZE_MAX = 4.2

const haloSparks = []

function HALO_PADDING() {
  return R_OUT * 0.35
} // distance from sphere surface
function HALO_BAND() {
  return R_OUT * 0.7
} // ring thickness

function emitHaloSparks(n, energy) {
  const cx = width / 2,
    cy = height / 2
  n = Math.min(n, HALO_SPARKS_MAX - haloSparks.length)
  for (let i = 0; i < n; i++) {
    const a = random(TWO_PI)

    const r0 = R_OUT + HALO_PADDING()
    const r1 = r0 + HALO_BAND()
    const r = random(r0, r1)

    const x = cx + r * cos(a)
    const y = cy + r * sin(a)

    // Main outward motion + slight tangential curl
    const outward = 0.6 + 1.4 * energy
    let vx = cos(a) * outward
    let vy = sin(a) * outward

    const curl = 0.2 + 0.3 * energy // subtle orbit
    vx += -sin(a) * curl * 0.3
    vy += cos(a) * curl * 0.3

    // Very visible colors: 70% yellow, 30% white
    const yellow = random() < 0.7
    const col = yellow ? [255, 240, 120] : [255, 255, 255]

    haloSparks.push({
      x,
      y,
      vx,
      vy,
      t: 0,
      life: floor(random(38, 72)),
      color: col,
      size: random(HALO_SIZE_MIN, HALO_SIZE_MAX),
      rStart: r, // for outward fade
    })
  }
}

function updateHaloSparks(energy) {
  blendMode(ADD)
  noStroke()

  const cx = width / 2,
    cy = height / 2
  for (let i = haloSparks.length - 1; i >= 0; i--) {
    const s = haloSparks[i]
    s.t++

    // light friction + tiny jitter
    s.vx *= 0.988
    s.vy *= 0.988
    s.vx += (noise(s.x * 0.004, frameCount * 0.012) - 0.5) * 0.06
    s.vy += (noise(s.y * 0.004, frameCount * 0.012 + 7.7) - 0.5) * 0.06

    s.x += s.vx
    s.y += s.vy

    // radial progress from birth position → fade outward
    const rNow = dist(s.x, s.y, cx, cy)
    const r0 = s.rStart
    const rMax = r0 + HALO_BAND() * 0.9
    const kRad = constrain((rNow - r0) / max(1, rMax - r0), 0, 1) // 0..1

    // fade by life and distance (disappear into the void)
    const kLife = constrain(s.t / s.life, 0, 1)
    const alpha =
      235 * (1 - kLife) * pow(1 - kRad, 1.2) * (0.45 + 0.55 * energy)

    fill(s.color[0], s.color[1], s.color[2], alpha)
    circle(s.x, s.y, s.size)

    if (kLife >= 1 || kRad >= 1) haloSparks.splice(i, 1)
  }
  blendMode(BLEND)
}

// ---------------- Setup & OSC ----------------
function setup() {
  createCanvas(windowWidth, windowHeight)
  pixelDensity(1)
  colorMode(RGB, 255)
  noStroke()

  const base = min(width, height)
  R_OUT = base * 0.22
  R_IN = R_OUT * 0.34

  for (let i = 0; i < N_IN; i++) inner.push(makeParticle(R_IN))
  for (let i = 0; i < N_OUT; i++) outer.push(makeParticle(R_OUT))

  // Socket.IO (served by your bridge.js)
  const BRIDGE_HOST = location.hostname || '127.0.0.1'
  const BRIDGE_PORT = 8081
  socket = io(`http://${BRIDGE_HOST}:${BRIDGE_PORT}`)
  socket.on('connect', () => console.log('✅ Connected to bridge'))
  socket.on('osc', onOsc)
}

function onOsc(pkt) {
  if (!pkt || !pkt.address) return
  if (pkt.address === '/uv/eq' && pkt.args?.length >= 3) {
    // Processing already smooths; this just rounds a bit more
    oscBass = lerp(oscBass, pkt.args[0], 0.22)
    oscMid = lerp(oscMid, pkt.args[1], 0.22)
    oscTreble = lerp(oscTreble, pkt.args[2], 0.25)
  }
}

// ---------------- Sphere particles ----------------
function makeParticle(r) {
  // uniform sampling on sphere
  const u = random(-1, 1)
  const phi = random(TWO_PI)
  const ax = sqrt(1 - u * u) * cos(phi)
  const ay = sqrt(1 - u * u) * sin(phi)
  const az = u
  return {
    ax,
    ay,
    az,
    x: ax * r,
    y: ay * r,
    z: az * r,
    vx: 0,
    vy: 0,
    vz: 0,
    s: random(0.7, 1.2),
    seed: random(1000),
    r,
    drift: random(0.5, 1.5),
  }
}

function rotY(x, y, z, a) {
  const c = cos(a),
    s = sin(a)
  return { x: c * x + s * z, y, z: -s * x + c * z }
}
function rotZ(x, y, z, a) {
  const c = cos(a),
    s = sin(a)
  return { x: c * x - s * y, y: s * x + c * y, z }
}

function flow3D(x, y, z, t) {
  const s = 0.004
  return {
    nx: noise(x * s, y * s, t) - 0.5,
    ny: noise(y * s + 13.1, z * s, t + 2) - 0.5,
    nz: noise(z * s - 7.7, x * s, t + 4) - 0.5,
  }
}

// Non-spherical deformation driven mostly by mids (with a touch of bass/treble)
function deformFactor(ax, ay, az, t, gain) {
  const ang = atan2(ay, ax) // azimuth
  const elev = acos(constrain(az, -1, 1)) // elevation
  const pat = 0.5 * cos(3 * ang + t * 0.8) + 0.5 * cos(2 * elev - t * 0.5)
  const band = oscMid + DEFORM_BASS_MIX * oscBass + DEFORM_TREB_MIX * oscTreble
  return 1.0 + gain * band * pat
}

function stepLayer(arr, strength, rTargetScale, deformGain) {
  const t = frameCount * 0.01
  for (const p of arr) {
    // rotate anchor (global spin) + slight breathing
    const ry = frameCount * SPIN_Y * 0.5
    const rz = frameCount * SPIN_Z * 0.5
    let { x: ax1, y: ay1, z: az1 } = rotY(p.ax, p.ay, p.az, ry)
    ;({ x: ax1, y: ay1, z: az1 } = rotZ(ax1, ay1, az1, rz))

    const wob = 0.016 * sin(t * 0.8 + p.seed) * p.drift
    ax1 += wob * (noise(p.seed + 1) - 0.5)
    ay1 += wob * (noise(p.seed + 2) - 0.5)
    az1 += wob * (noise(p.seed + 3) - 0.5)

    const al = 1 / max(1e-6, sqrt(ax1 * ax1 + ay1 * ay1 + az1 * az1))
    ax1 *= al
    ay1 *= al
    az1 *= al

    // tangential flow
    const f = flow3D(p.x, p.y, p.z, t)
    const fdotn = f.nx * ax1 + f.ny * ay1 + f.nz * az1
    let tx = (f.nx - fdotn * ax1) * strength
    let ty = (f.ny - fdotn * ay1) * strength
    let tz = (f.nz - fdotn * az1) * strength

    // mild jitter
    if (random() < 0.004) {
      tx += random(-0.05, 0.05)
      ty += random(-0.05, 0.05)
      tz += random(-0.05, 0.05)
    }

    // integrate velocity
    p.vx += tx
    p.vy += ty
    p.vz += tz
    const vmag = sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz)
    if (vmag > VMAX) {
      const m = VMAX / vmag
      p.vx *= m
      p.vy *= m
      p.vz *= m
    }
    p.x += p.vx
    p.y += p.vy
    p.z += p.vz

    // project back to deformed shell (scaled by treble)
    const deform = deformFactor(ax1, ay1, az1, t, deformGain)
    const rr = p.r * rTargetScale * deform + random(-JITTER_R, JITTER_R)
    p.x = ax1 * rr
    p.y = ay1 * rr
    p.z = az1 * rr

    // damping
    p.vx *= 0.88
    p.vy *= 0.88
    p.vz *= 0.88

    // occasionally re-seed anchor to avoid fixed patterns
    if (frameCount % 420 === 0 && random() < 0.1) {
      p.ax = ax1
      p.ay = ay1
      p.az = az1
    }
  }
}

function drawLayerWithBoost(arr, rgb, maxSize, boost) {
  const cx = width / 2,
    cy = height / 2
  const ry = frameCount * SPIN_Y
  const rz = frameCount * SPIN_Z
  for (const p of arr) {
    let { x, y, z } = rotY(p.x, p.y, p.z, ry)
    ;({ x, y, z } = rotZ(x, y, z, rz))
    const s = FOV / (FOV - z)
    const sx = cx + x * s
    const sy = cy + y * s
    const depth = constrain(map(z, -R_OUT, R_OUT, 0, 1), 0, 1)
    let alpha = lerp(70, 180, depth) * boost
    alpha = constrain(alpha, 30, 220)
    const size = max(1, lerp(0.8, maxSize, depth) * p.s)
    noStroke()
    fill(rgb[0], rgb[1], rgb[2], alpha)
    circle(sx, sy, size)
  }
}

// ---------------- Draw loop ----------------
function draw() {
  // background with soft trails
  fill(0, FADE)
  rect(0, 0, width, height)

  // overall energy (for sparks & subtle mapping)
  const energy = constrain((oscBass + oscMid + oscTreble) / 3, 0, 1)

  // ----- SPARKS first (so they don't cover the sphere) -----
  if (energy > HALO_ENERGY_GATE) {
    const n = floor(lerp(0, HALO_BASE_PER_FRAME, energy))
    emitHaloSparks(n, energy)
  }
  updateHaloSparks(energy)

  // ----- Sphere on top -----
  // Keep growth modest so deformation is noticeable
  const rScaleOuter = 1.0 + 0.16 * oscTreble
  const rScaleInner = 1.0 + 0.08 * oscTreble

  // Slightly stronger flow for outer (raise treble mix + ceiling)
  const flowFromAudio = constrain(
    FLOW_OUT + 0.18 * oscMid + 0.14 * oscTreble,
    0.18,
    0.7
  )

  // Bass → slight global spin
  SPIN_Y = 0.01 + 0.01 * oscBass

  // Brightness (moderate)
  const BRIGHT_OUT = 1.0 + 0.4 * oscTreble
  const BRIGHT_IN = 1.0 + 0.3 * oscBass

  // Integrate
  stepLayer(inner, FLOW_IN, rScaleInner, DEFORM_GAIN_IN)
  stepLayer(outer, flowFromAudio, rScaleOuter, DEFORM_GAIN_OUT)

  // Draw layers (ADD for glow)
  blendMode(ADD)
  drawLayerWithBoost(outer, [50, 255, 80], 2.2, BRIGHT_OUT) // green outer shell
  drawLayerWithBoost(inner, [255, 40, 40], 2.6, BRIGHT_IN) // red core
  blendMode(BLEND)
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  const base = min(width, height)
  R_OUT = base * 0.22
  R_IN = R_OUT * 0.34
}
