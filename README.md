# Genesis Sphere — An Audio-Reactive Energy Core (p5.js + OSC)

### by Ursula Vallejo Janne

---

## Overview

**Genesis Sphere** is an **audio-reactive generative art experiment** created with **p5.js** and **OSC** as part of the _Creative Coding_ course at **Högskola Dalarna**.
It visualizes a **primordial nucleus of life** — a sphere of living energy that responds to sound frequencies and transforms in real time.

The work blends mathematical structure and organic motion, exploring how **vibration becomes form** — how sound could be a way visual creation.

---

## Concept

At the core lies a pulsating, self-contained “molecule” surrounded by glowing particles.
Incoming **OSC audio data** (bass, mid, treble) animates different aspects of the sphere:

| Frequency     | Visual effect                                                                   |
| ------------- | ------------------------------------------------------------------------------- |
| **Bass**      | Slight acceleration of the global spin and subtle brightening of the inner-core |
| **Mid**       | Non-spherical deformations (organic breathing)                                  |
| **Treble**    | Outer-layer brightness and radial growth                                        |
| **All bands** | Trigger emission of _halo sparks_ — bursts of light that escape the sphere      |

The result is a meditative visualization — a **Genesis moment**, where energy begins to organize into life.

---

## Features

- **Real-time sound-reactivity** through OSC data (`/uv/eq [bass, mid, treble]`)
- **Bridge connection** using **Socket.IO** between Processing and the browser
- **Dual-layer structure:**
- _Inner core_ (red): stable, dense nucleus
- _Outer membrane_ (green): dynamic shell that deforms with mids
- **Halo Sparks:** glowing particles emitted from the outer ring, fading outward with audio energy
- **Organic motion:** Perlin-noise-driven flow fields and smooth rotation

---

## Technical Overview

- **Framework:** [p5.js](https://p5js.org/)
- **Data Input:** OSC via Processing → Node.js bridge → Socket.IO
- **Main Script:** `sketch.js`
- **Core functions:**
  - `onOsc(pkt)` → receives live audio data
  - `stepLayer()` → integrates flow, deformation, and velocity
  - `emitHaloSparks()` / `updateHaloSparks()` → creates and animates energy particles
  - `drawLayerWithBoost()` → renders glowing shells with additive blending

---

## Setup & Run

1. **Clone this repository**

   ```bash
   git clone https://github.com/yourusername/p5js-osc-Genesis_Sphere.git
   cd p5js-osc-Genesis_Sphere
   ```

2. **Start the OSC Bridge**
   Run your `bridge.js` (Node.js + Socket.IO) server to forward OSC messages:

   ```bash
   node bridge.js
   ```

3. **Send OSC data**
   From Processing (or any OSC source), send messages to:

   ```
   /uv/eq [bass, mid, treble]
   ```

4. **Run the sketch**
   Open `index.html` with **Live Server** or any local HTTP server.

---

## Artistic Reflection

This experiment explores the intersection between **sound, structure, and organic form**,
asking how vibration could be the first gesture of life itself.
_Ursula Vallejo Janne_

---

## Video

![Genesis Sphere demo](assets/screenshot.png)

---

## License

© 2025 **Ursula Vallejo Janne**
Released under the [MIT License](./LICENSE).
You are free to explore, remix, and use this work for educational or artistic purposes.

```

```
