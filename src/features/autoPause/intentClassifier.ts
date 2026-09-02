export type SpeechIntent = 'conversation' | 'study' | 'uncertain';

// Whisper translates Japanese speech to English before classification. Keeping
// several natural examples per class is more robust than relying on a single
// abstract label, while remaining small enough to embed once when the worker starts.
export const CONVERSATION_EXAMPLES = [
  'I am chatting with viewers and responding to their comments.',
  'I am talking casually about games, food, shopping, or my personal life.',
  'I am greeting a viewer and asking how their day was.',
  'I am thanking a viewer and answering a question from the chat.',
  'I stopped studying and am having an unrelated conversation.',
] as const;

export const STUDY_EXAMPLES = [
  'I am explaining a lesson, formula, or academic concept while studying.',
  'I am solving a question or calculating an answer.',
  'I am reading, memorizing, or reviewing study material.',
  'I am thinking aloud about the problem I am working on.',
  'I am discussing the subject that I am currently studying.',
] as const;

export function averageTopScores(scores: number[], count = 2) {
  if (scores.length === 0) return 0;
  const selected = [...scores].sort((left, right) => right - left).slice(0, count);
  return selected.reduce((total, score) => total + score, 0) / selected.length;
}

export function classifySpeechIntent({
  textLength,
  conversationScore,
  studyScore,
}: {
  textLength: number;
  conversationScore: number;
  studyScore: number;
}): SpeechIntent {
  const margin = conversationScore - studyScore;
  // A false stop is more disruptive than a missed stop. Short or ambiguous
  // phrases therefore remain uncertain and reset accumulated evidence.
  if (textLength >= 12 && conversationScore >= 0.45 && margin >= 0.03) {
    return 'conversation';
  }
  if (studyScore >= 0.48 && margin <= -0.03) return 'study';
  return 'uncertain';
}
