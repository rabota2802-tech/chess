let context;
export function unlock() {
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {}
}
const tones = {
  move: [390],
  capture: [290, 190],
  check: [510, 690],
  castle: [300, 450],
  promotion: [450, 600, 800],
  warning: [800, 800],
  win: [440, 550, 660],
  loss: [420, 330, 240],
  draw: [380, 380],
};
export function sound(kind, prefs) {
  if (!prefs.sound || !context) return;
  tones[kind].forEach((hz, i) => {
    const t = context.currentTime + i * 0.1,
      osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, 0.12 * prefs.volume),
      t + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(context.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  });
}
