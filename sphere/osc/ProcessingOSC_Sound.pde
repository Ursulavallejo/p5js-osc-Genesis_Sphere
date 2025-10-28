// === Processing → OSC: envía graves/medios/agudos con NOISE GATE + HISTERESIS ===
// Requiere: Sound (incluida) + oscP5 (Contrib Manager)

import processing.sound.*;
import oscP5.*;
import netP5.*;

AudioIn mic;
FFT fft;

int BANDS = 512;
float sampleRate = 44100;

// Bandas moderadas (móvil)
float BASS_LO = 80,   BASS_HI = 260;
float MID_LO  = 260,  MID_HI  = 3500;
float TRE_LO  = 3500, TRE_HI  = 9000;

// OSC
OscP5 oscP5;
NetAddress dest;
String OSC_ADDR     = "/uv/eq";
String OSC_ADDR_DOM = "/uv/dominant";
String BRIDGE_HOST  = "127.0.0.1";
int    BRIDGE_OSC_PORT = 8000;

// Suavizado local (0 = sin suavizado, 1 = muy lento)
float sBass = 0, sMid = 0, sTre = 0;
float SMOOTH = 0.22;

// Ganancias / normalización (moderadas)
float BAND_GAIN = 10.0; // ↓ antes 12
float BASS_BOOST = 1.3;
float MID_BOOST  = 1.0;
float TRE_BOOST  = 1.1;

// ---------- Noise gate por banda ----------
float floorBass = 0, floorMid = 0, floorTre = 0;
// El "piso" (ruido ambiente) aprende DESPACIO:
float FLOOR_ALPHA = 0.004;    // qué rápido aprende el piso (muy lento)
// Margen extra por encima del piso para dejar pasar señal:
float FLOOR_MARGIN = 0.025;   // 2.5% del rango (ajusta a gusto)

// ---------- Puerta global con histéresis ----------
boolean gateOpen = false;
float GATE_ON  = 0.18;  // abre por encima de este nivel de energía
float GATE_OFF = 0.10;  // cierra por debajo de este nivel

void setup() {
  size(640, 220);
  surface.setTitle("Processing → OSC (EQ + NoiseGate/Hysteresis)");

  mic = new AudioIn(this, 0);
  mic.start();
  mic.amp(1.2);  // ↓ antes 1.6

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

  // --- Energía cruda por banda ---
  float bass = bandEnergy(BASS_LO, BASS_HI) * BASS_BOOST;
  float mid  = bandEnergy(MID_LO,  MID_HI)  * MID_BOOST;
  float tre  = bandEnergy(TRE_LO,  TRE_HI)  * TRE_BOOST;

  // Compresión log (suave) + clamp 0..1
  bass = constrain((float)Math.log1p(5.0 * bass), 0, 1);
  mid  = constrain((float)Math.log1p(5.0 * mid),  0, 1);
  tre  = constrain((float)Math.log1p(5.0 * tre),  0, 1);

  // --- Actualiza pisos (ruido ambiente) MUY lentamente ---
  floorBass = lerp(floorBass, bass, FLOOR_ALPHA);
  floorMid  = lerp(floorMid,  mid,  FLOOR_ALPHA);
  floorTre  = lerp(floorTre,  tre,  FLOOR_ALPHA);

  // --- Aplica gate por banda: recorta por debajo de piso+margen ---
  float gBass = max(0, bass - floorBass - FLOOR_MARGIN);
  float gMid  = max(0, mid  - floorMid  - FLOOR_MARGIN);
  float gTre  = max(0, tre  - floorTre  - FLOOR_MARGIN);

  // Suavizado (después del gate por banda)
  sBass = lerp(sBass, gBass, 1.0 - SMOOTH);
  sMid  = lerp(sMid,  gMid,  1.0 - SMOOTH);
  sTre  = lerp(sTre,  gTre,  1.0 - SMOOTH);

  // --- Gate global con histéresis ---
  float energy = (sBass + sMid + sTre) / 3.0;
  if (gateOpen) {
    if (energy < GATE_OFF) gateOpen = false;
  } else {
    if (energy > GATE_ON) gateOpen = true;
  }

  float outBass = gateOpen ? sBass : 0;
  float outMid  = gateOpen ? sMid  : 0;
  float outTre  = gateOpen ? sTre  : 0;

  // Enviar OSC
  OscMessage m = new OscMessage(OSC_ADDR);
  m.add(outBass); m.add(outMid); m.add(outTre);
  oscP5.send(m, dest);

  // Dominante (opcional)
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

// Suma de energía de bins entre fLo..fHi; escalado base
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
