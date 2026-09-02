import { describe, expect, it } from 'vitest';
import { advanceSustainedSignal, resampleAudio } from './useAutoPause';

describe('automatic pause signals', () => {
  it('fires only after a continuous signal reaches the configured duration', () => {
    expect(advanceSustainedSignal(null, true, 1_000, 2_000)).toEqual({ startedAt: 1_000, ready: false });
    expect(advanceSustainedSignal(1_000, true, 2_999, 2_000).ready).toBe(false);
    expect(advanceSustainedSignal(1_000, true, 3_000, 2_000).ready).toBe(true);
    expect(advanceSustainedSignal(1_000, false, 2_000, 2_000)).toEqual({ startedAt: null, ready: false });
  });

  it('resamples captured microphone audio to Whisper\'s 16 kHz input', () => {
    const source = new Float32Array([0, 1, 0, -1, 0, 1, 0, -1]);
    const result = resampleAudio(source, 32_000, 16_000);
    expect(result).toHaveLength(4);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });
});
