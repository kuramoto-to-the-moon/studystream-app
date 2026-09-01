import type { CompletionSound, Phase } from './model';

let audioContext: AudioContext | null = null;

export function prepareCompletionSound() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    // Audio is optional; unsupported or blocked environments keep the visual state change.
  }
}

function tone(
  context: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function scheduleChime(context: AudioContext, start: number, completedPhase: Exclude<Phase, 'idle'>) {
  const notes = completedPhase === 'study' ? [987.77, 1318.51, 1567.98] : [1318.51, 987.77];
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 0.14;
    tone(context, noteStart, frequency, 0.28, 0.04, 'triangle');
    tone(context, noteStart, frequency * 2, 0.18, 0.006);
  });
}

function scheduleBell(context: AudioContext, start: number, completedPhase: Exclude<Phase, 'idle'>) {
  const frequency = completedPhase === 'study' ? 1174.66 : 987.77;
  [0, 0.32].forEach((offset) => {
    tone(context, start + offset, frequency, 0.46, 0.04, 'triangle');
    tone(context, start + offset, frequency * 2.68, 0.3, 0.012);
    tone(context, start + offset, frequency * 4.12, 0.2, 0.004);
  });
}

function scheduleBeep(context: AudioContext, start: number, completedPhase: Exclude<Phase, 'idle'>) {
  const frequency = completedPhase === 'study' ? 1046.5 : 1318.51;
  [0, 0.2, 0.4, 0.6].forEach((offset) => {
    tone(context, start + offset, frequency, 0.115, 0.032, 'square');
  });
}

export async function playCompletionSound(
  completedPhase: Exclude<Phase, 'idle'>,
  sound: CompletionSound = 'chime',
) {
  try {
    prepareCompletionSound();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    const start = audioContext.currentTime + 0.03;
    if (sound === 'bell') scheduleBell(audioContext, start, completedPhase);
    else if (sound === 'beep') scheduleBeep(audioContext, start, completedPhase);
    else scheduleChime(audioContext, start, completedPhase);
  } catch {
    // Keep timers functional when an OS or browser blocks audio playback.
  }
}
