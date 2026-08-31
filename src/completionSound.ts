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

    const notes = completedPhase === 'study'
      ? [659.25, 523.25]
      : [523.25, 659.25];
    const start = audioContext.currentTime + 0.03;

    notes.forEach((frequency, index) => {
      if (!audioContext) return;
      const noteStart = start + index * 0.22;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.34);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.36);
    });
  } catch {
    // Keep timers functional when an OS or browser blocks audio playback.
  }
}
