import { describe, expect, it } from 'vitest';
import { averageTopScores, classifySpeechIntent } from './intentClassifier';

describe('local speech intent classification policy', () => {
  it('requires a meaningful conversation margin before stopping', () => {
    expect(classifySpeechIntent({ textLength: 36, conversationScore: 0.64, studyScore: 0.53 }))
      .toBe('conversation');
    expect(classifySpeechIntent({ textLength: 36, conversationScore: 0.55, studyScore: 0.54 }))
      .toBe('uncertain');
  });

  it('never treats short ambiguous speech as conversation', () => {
    expect(classifySpeechIntent({ textLength: 8, conversationScore: 0.9, studyScore: 0.1 }))
      .toBe('uncertain');
  });

  it('recognizes study evidence and leaves weak evidence uncertain', () => {
    expect(classifySpeechIntent({ textLength: 45, conversationScore: 0.4, studyScore: 0.62 }))
      .toBe('study');
    expect(classifySpeechIntent({ textLength: 45, conversationScore: 0.42, studyScore: 0.46 }))
      .toBe('uncertain');
  });

  it('averages only the strongest representative examples', () => {
    expect(averageTopScores([0.2, 0.8, 0.6, 0.1])).toBeCloseTo(0.7);
    expect(averageTopScores([])).toBe(0);
  });
});
