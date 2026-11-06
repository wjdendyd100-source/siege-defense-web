// 효과음: 외부 음원 없이 WebAudio로 즉석 합성 (저작권 문제 없음)
let ctx = null, master = null, enabled = true;
export function setSfx(on) { enabled = on; }
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noise(dur) {
  const c = ac(); const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s;
}
function env(g, t, a, peak, rel) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); }
let last = {};
export function sfx(name, vol = 1) {
  if (!enabled) return; const c = ac(); if (!c) return;
  const now = c.currentTime; if (last[name] && now - last[name] < 0.03) return; last[name] = now;
  const g = c.createGain(); g.connect(master);
  if (name === 'swing') { const n = noise(0.18); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, now); f.frequency.exponentialRampToValueAtTime(3200, now + 0.12); f.Q.value = 1.2; n.connect(f); f.connect(g); env(g, now, 0.01, 0.5 * vol, 0.15); n.start(now); n.stop(now + 0.2); }
  else if (name === 'hit') { const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(60, now + 0.08); o.connect(g); const n = noise(0.08); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; n.connect(f); f.connect(g); env(g, now, 0.003, 0.45 * vol, 0.09); o.start(now); o.stop(now + 0.12); n.start(now); n.stop(now + 0.09); }
  else if (name === 'heavy') { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(35, now + 0.35); o.connect(g); const n = noise(0.3); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; n.connect(f); f.connect(g); env(g, now, 0.005, 0.9 * vol, 0.35); o.start(now); o.stop(now + 0.4); n.start(now); n.stop(now + 0.3); }
  else if (name === 'arrow') { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(1400, now); o.frequency.exponentialRampToValueAtTime(500, now + 0.12); o.connect(g); env(g, now, 0.005, 0.18 * vol, 0.1); o.start(now); o.stop(now + 0.14); }
  else if (name === 'gun') { const n = noise(0.25); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, now); f.frequency.exponentialRampToValueAtTime(300, now + 0.2); n.connect(f); f.connect(g); env(g, now, 0.002, 0.7 * vol, 0.22); n.start(now); n.stop(now + 0.26); }
  else if (name === 'magic') { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(900, now + 0.2); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; o.connect(f); f.connect(g); env(g, now, 0.02, 0.22 * vol, 0.25); o.start(now); o.stop(now + 0.3); }
  else if (name === 'heal') { [660, 880, 1320].forEach((fq, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; const gg = c.createGain(); gg.connect(master); o.connect(gg); env(gg, now + i * 0.05, 0.01, 0.12 * vol, 0.3); o.start(now + i * 0.05); o.stop(now + i * 0.05 + 0.35); }); return; }
  else if (name === 'coin') { [988, 1319].forEach((fq, i) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = fq; const gg = c.createGain(); gg.connect(master); o.connect(gg); env(gg, now + i * 0.07, 0.005, 0.08 * vol, 0.12); o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.15); }); return; }
  else if (name === 'summon') { [523, 659, 784, 1046].forEach((fq, i) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; const gg = c.createGain(); gg.connect(master); o.connect(gg); env(gg, now + i * 0.06, 0.01, 0.16 * vol, 0.25); o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.3); }); return; }
  else if (name === 'ui') { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 760; o.connect(g); env(g, now, 0.004, 0.12 * vol, 0.07); o.start(now); o.stop(now + 0.09); }
  else if (name === 'lose') { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(90, now + 0.5); o.connect(g); env(g, now, 0.01, 0.25 * vol, 0.5); o.start(now); o.stop(now + 0.55); }
  else if (name === 'win') { [523, 659, 784, 1046, 1318].forEach((fq, i) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; const gg = c.createGain(); gg.connect(master); o.connect(gg); env(gg, now + i * 0.11, 0.01, 0.2 * vol, 0.5); o.start(now + i * 0.11); o.stop(now + i * 0.11 + 0.6); }); return; }
}
