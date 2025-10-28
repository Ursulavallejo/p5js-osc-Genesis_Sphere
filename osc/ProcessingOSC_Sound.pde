/**
 * === Genesis Sphere — Audio Analysis via Processing → OSC Bridge ===
 *
 * This Processing (Java) sketch captures live audio from the microphone,
 * performs a real-time frequency analysis (FFT) with a per-band noise gate
 * and global hysteresis, and sends the resulting bass, mid, and treble values
 * via OSC to a Node.js Socket.IO bridge.
 *
 * The bridge then rebroadcasts these values to any connected p5.js clients
 * (in the browser), allowing them to create audio-reactive visualizations.
 *
 * Structure:
 * Processing → (FFT + noise gate + hysteresis)
 *    → OSC → Node.js Bridge → WebSocket → p5.js (visuals)
 *
 * Requirements:
 * - Processing Sound library (included)
 * - oscP5 and netP5 (via Contribution Manager)
 *
 * Author: Ursula Vallejo Janne
 * Project: Genesis Sphere (Creative Coding — Högskola Dalarna)
 * Year: 2025
 */

// === Processing → OSC: sends bass/mid/treble with NOISE GATE + HYSTERESIS ===
// Requires: Sound (included) + oscP5 (via Contribution Manager)

import processing.sound.*;
import oscP5.*;
import netP5.*;

AudioIn mic;
FFT fft;

int BANDS = 512;
float sampleRate = 44100;

// Moderate frequency bands (mobile-friendly)
float BASS_LO = 80,   BASS_HI = 260;
float MID_LO  = 260,  MID_HI  = 3500;
float TRE_LO  = 3500, TRE_HI  = 9000;

// OSC configuration
OscP5 oscP5;
NetAddress dest;
String OSC_ADDR     = "/uv/eq";
String OSC_ADDR_DOM = "/uv/dominant";
String BRIDGE_HOST  = "127.0.0.1";
int    BRIDGE_OSC_PORT = 8000;

// Local smoothing (0 = no smoothing, 1 = very slow)
float sBass = 0, sMid = 0, sTre = 0;
float SMOOTH = 0.22;

// Gain / normalization (moderate)
float BAND_GAIN = 10.0; // ↓ previously 12
float BASS_BOOST = 1.3;
float MID_BOOST  = 1.0;
float TRE_BOOST  = 1.1;

// ---------- Noise gate per band ----------
float floorBass = 0, floorMid = 0, floorTre = 0;
// The "floor" (ambient noise) learns SLOWLY:
float FLOOR_ALPHA = 0.004;    // how fast the floor adapts (very slow)
// Extra margin above the floor to let signal pass:
float FLOOR_MARGIN = 0.025;   // 2.5% of the range (adjust as needed)

// ---------- Global gate with hysteresis ----------
boolean gateOpen = false;
float GATE_ON  = 0.18;  // opens above this energy level
float GATE_OFF = 0.10;  // closes below this energy level

void setup() {
  size(640, 220);
  surface.setTitle("Processing → OSC (EQ + NoiseGate/Hysteresis)");

  mic = new AudioIn(this, 0);
  mic.start();
  mic.amp(1.2);  // ↓ previously 1.6

  fft = new FFT(this, BANDS);
  fft.input(mic);

  oscP5 = new OscP5(this, 0);
  dest = new NetAddress(BRIDGE_HOST, BRIDGE_OSC_PORT);

  textFont(createFont("Arial", 14));
  noStroke();
}

void draw() {
  background(0);
  fft.analyze();

  // --- Raw energy per frequency band ---
  float bass = bandEnergy(BASS_LO, BASS_HI) * BASS_BOOST;
  float mid  = bandEnergy(MID_LO,  MID_HI)  * MID_BOOST;
  float tre  = bandEnergy(TRE_LO,  TRE_HI)  * TRE_BOOST;

  // Log compression (gentle) + clamp 0..1
  bass = constrain((float)Math.log1p(5.0 * bass), 0, 1);
  mid  = constrain((float)Math.log1p(5.0 * mid),  0, 1);
  tre  = constrain((float)Math.log1p(5.0 * tre),  0, 1);

  // --- Slowly update floor (ambient noise) ---
  floorBass = lerp(floorBass, bass, FLOOR_ALPHA);
  floorMid  = lerp(floorMid,  mid,  FLOOR_ALPHA);
  floorTre  = lerp(floorTre,  tre,  FLOOR_ALPHA);

  // --- Apply per-band gate: cut below floor + margin ---
  float gBass = max(0, bass - floorBass - FLOOR_MARGIN);
  float gMid  = max(0, mid  - floorMid  - FLOOR_MARGIN);
  float gTre  = max(0, tre  - floorTre  - FLOOR_MARGIN);

  // Smoothing (after the per-band gate)
  sBass = lerp(sBass, gBass, 1.0 - SMOOTH);
  sMid  = lerp(sMid,  gMid,  1.0 - SMOOTH);
  sTre  = lerp(sTre,  gTre,  1.0 - SMOOTH);

  // --- Global gate with hysteresis ---
  float energy = (sBass + sMid + sTre) / 3.0;
  if (gateOpen) {
    if (energy < GATE_OFF) gateOpen = false;
  } else {
    if (energy > GATE_ON) gateOpen = true;
  }

  float outBass = gateOpen ? sBass : 0;
  float outMid  = gateOpen ? sMid  : 0;
  float outTre  = gateOpen ? sTre  : 0;

  // Send OSC
  OscMessage m = new OscMessage(OSC_ADDR);
  m.add(outBass); m.add(outMid); m.add(outTre);
  oscP5.send(m, dest);

  // Dominant band (optional)
  int dom = 0; float maxv = outBass;
  if (outMid > maxv) { maxv = outMid; dom = 1; }
  if (outTre > maxv) { maxv = outTre; dom = 2; }
  OscMessage d = new OscMessage(OSC_ADDR_DOM);
  d.add(dom); d.add(maxv);
  oscP5.send(d, dest);

  // --- Debug UI ---
  fill(255);
  text("bass: " + nf(outBass,1,3) + "   mid: " + nf(outMid,1,3) + "   tre: " + nf(outTre,1,3), 10, 28);
  text("gate: " + (gateOpen ? "OPEN" : "CLOSED"), 10, 50);
  fill(160);
  text("floors  B:" + nf(floorBass,1,3)+"  M:"+nf(floorMid,1,3)+"  T:"+nf(floorTre,1,3), 10, 72);
  text("SMOOTH="+SMOOTH+"  amp=1.2  BAND_GAIN="+BAND_GAIN+"  margin="+FLOOR_MARGIN, 10, 94);
}

// Sum of FFT bin energy between fLo..fHi; base scaling
float bandEnergy(float fLo, float fHi) {
  int iLo = freqToBin(fLo);
  int iHi = freqToBin(fHi);
  iLo = constrain(iLo, 0, BANDS-1);
  iHi = constrain(iHi, 0, BANDS-1);
  float sum = 0;
  for (int i = iLo; i <= iHi; i++) sum += fft.spectrum[i];
  return sum * BAND_GAIN;
}

int freqToBin(float f) {
  return round(f * BANDS / (sampleRate / 2.0));
}
