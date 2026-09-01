import type { Phase } from './model';

let audioContext: AudioContext | null = null;

export function prepareCompletionSound() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    // Audio is optional; unsupported or blocked environments keep the visual state change.
  }
}

export async function playCompletionSound(completedPhase: Exclude<Phase, 'idle'>) {
  try {
    prepareCompletionSound();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') await audioContext.resume();

    // Repeated pulses are easier to recognize as a warning than a short melody.
    // Pace and fundamental frequency carry the urgency cue:
    // https://doi.org/10.1177/001872089103300206
    const profile = completedPhase === 'study'
      ? { frequency: 620, interval: 0.38 }
      : { frequency: 760, interval: 0.3 };
    const start = audioContext.currentTime + 0.03;

    [0, 1, 2].forEach((index) => {
      if (!audioContext) return;
      const pulseStart = start + index * profile.interval;

      [
        { ratio: 1, volume: 0.07 },
        { ratio: 2, volume: 0.018 },
      ].forEach(({ ratio, volume }) => {
        if (!audioContext) return;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(profile.frequency * ratio, pulseStart);
        gain.gain.setValueAtTime(0.0001, pulseStart);
        gain.gain.exponentialRampToValueAtTime(volume, pulseStart + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, pulseStart + 0.24);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(pulseStart);
        oscillator.stop(pulseStart + 0.26);
      });
    });
  } catch {
    // Keep timers functional when an OS or browser blocks audio playback.
  }
}
