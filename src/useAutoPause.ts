import { useEffect, useRef, useState } from 'react';
import type { SpeechIntent } from './features/autoPause/intentClassifier';

export type SensorState = 'idle' | 'starting' | 'watching' | 'analyzing' | 'unavailable' | 'denied' | 'error';
export type LocalModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface AutoPauseSensorStates {
  voice: SensorState;
  model: LocalModelState;
}

interface SustainedSignal {
  startedAt: number | null;
  ready: boolean;
}

interface WorkerMessage {
  type: 'ready' | 'result' | 'error';
  intent?: SpeechIntent;
  confidence?: number;
  speechMilliseconds?: number;
  message?: string;
}

export function advanceSustainedSignal(
  startedAt: number | null,
  detected: boolean,
  now: number,
  requiredMilliseconds: number,
): SustainedSignal {
  if (!detected) return { startedAt: null, ready: false };
  const nextStartedAt = startedAt ?? now;
  return {
    startedAt: nextStartedAt,
    ready: now - nextStartedAt >= requiredMilliseconds,
  };
}

export function resampleAudio(samples: Float32Array, sourceRate: number, targetRate = 16_000) {
  if (sourceRate === targetRate) return samples;
  const targetLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(targetLength);
  const scale = sourceRate / targetRate;
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * scale;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(samples.length - 1, lower + 1);
    const mix = sourceIndex - lower;
    output[index] = samples[lower] * (1 - mix) + samples[upper] * mix;
  }
  return output;
}

function mergeAudio(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function sensorErrorState(error: unknown): SensorState {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'denied';
  }
  if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'NotSupportedError')) {
    return 'unavailable';
  }
  return 'error';
}

export function useAutoPause({
  monitoring,
  timerRunning,
  autoPaused,
  voiceEnabled,
  voiceSeconds,
  speechLanguage,
  onPause,
  onResume,
}: {
  monitoring: boolean;
  timerRunning: boolean;
  autoPaused: boolean;
  voiceEnabled: boolean;
  voiceSeconds: number;
  speechLanguage: 'ja' | 'en';
  onPause: () => void;
  onResume: () => void;
}) {
  const pauseRef = useRef(onPause);
  const resumeRef = useRef(onResume);
  const monitoringRef = useRef(monitoring);
  const timerRunningRef = useRef(timerRunning);
  const autoPausedRef = useRef(autoPaused);
  const analysisBusyRef = useRef(false);
  const conversationMillisecondsRef = useRef(0);
  const resumeRequestedRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const [states, setStates] = useState<AutoPauseSensorStates>({ voice: 'idle', model: 'idle' });
  pauseRef.current = onPause;
  resumeRef.current = onResume;
  monitoringRef.current = monitoring;
  timerRunningRef.current = timerRunning;
  autoPausedRef.current = autoPaused;

  useEffect(() => {
    if (autoPaused) resumeRequestedRef.current = false;
  }, [autoPaused]);

  useEffect(() => {
    if (!voiceEnabled && autoPaused) resumeRef.current();
  }, [autoPaused, voiceEnabled]);

  useEffect(() => {
    if (!voiceEnabled || !monitoring) {
      workerRef.current = null;
      analysisBusyRef.current = false;
      conversationMillisecondsRef.current = 0;
      setStates({ voice: 'idle', model: 'idle' });
      return;
    }

    const worker = new Worker(new URL('./workers/localTranscription.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setStates((current) => ({ ...current, model: 'loading' }));

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === 'ready') {
        setStates((current) => ({ ...current, model: 'ready' }));
        return;
      }
      if (event.data.type === 'error') {
        console.error('[local-speech-analysis]', event.data.message ?? 'unknown error');
        analysisBusyRef.current = false;
        setStates((current) => ({ ...current, voice: 'error', model: 'error' }));
        return;
      }

      analysisBusyRef.current = false;
      const speechMilliseconds = Math.max(0, event.data.speechMilliseconds ?? 0);
      if (event.data.intent === 'study') {
        conversationMillisecondsRef.current = 0;
        if (autoPausedRef.current && !resumeRequestedRef.current) {
          resumeRequestedRef.current = true;
          resumeRef.current();
        }
      } else if (event.data.intent === 'conversation') {
        if (!autoPausedRef.current) {
          conversationMillisecondsRef.current += speechMilliseconds;
          if (timerRunningRef.current
            && conversationMillisecondsRef.current >= voiceSeconds * 1000) {
            conversationMillisecondsRef.current = 0;
            pauseRef.current();
          }
        }
      } else if (!autoPausedRef.current) {
        // Unknown speech must not accumulate into an automatic stop.
        conversationMillisecondsRef.current = 0;
      }
      setStates((current) => ({ ...current, voice: monitoringRef.current ? 'watching' : 'idle' }));
    };
    worker.onerror = () => {
      analysisBusyRef.current = false;
      setStates((current) => ({ ...current, voice: 'error', model: 'error' }));
    };
    worker.postMessage({ type: 'prepare' });

    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      analysisBusyRef.current = false;
      conversationMillisecondsRef.current = 0;
    };
  }, [monitoring, voiceEnabled, voiceSeconds]);

  useEffect(() => {
    if (!monitoring || !voiceEnabled) {
      setStates((current) => current.voice === 'idle' ? current : { ...current, voice: 'idle' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStates((current) => ({ ...current, voice: 'unavailable' }));
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let captureChunks: Float32Array[] = [];
    let preRollChunks: Float32Array[] = [];
    let captureStartedAt: number | null = null;
    let lastSpeechInCaptureAt: number | null = null;
    let mostRecentSpeechAt = performance.now();
    let speakingMilliseconds = 0;
    let noiseFloor = 0.008;
    setStates((current) => ({ ...current, voice: 'starting' }));

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
          video: false,
        });
        if (cancelled) return;

        audioContext = new AudioContext({ latencyHint: 'interactive' });
        const source = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        const silentOutput = audioContext.createGain();
        silentOutput.gain.value = 0;
        source.connect(processor);
        processor.connect(silentOutput);
        silentOutput.connect(audioContext.destination);
        setStates((current) => ({ ...current, voice: 'watching' }));

        processor.onaudioprocess = (event) => {
          if (cancelled) return;
          const input = event.inputBuffer.getChannelData(0);
          const chunk = new Float32Array(input);
          let total = 0;
          for (const sample of chunk) total += sample * sample;
          const rms = Math.sqrt(total / chunk.length);
          const threshold = Math.max(0.018, noiseFloor * 3.2);
          const speaking = rms > threshold;
          const now = performance.now();
          const blockMilliseconds = chunk.length / event.inputBuffer.sampleRate * 1000;

          if (speaking) {
            mostRecentSpeechAt = now;
          } else {
            noiseFloor = noiseFloor * 0.98 + Math.min(rms, 0.03) * 0.02;
            if (!autoPausedRef.current && now - mostRecentSpeechAt >= 1_800) {
              conversationMillisecondsRef.current = 0;
            }
            if (autoPausedRef.current
              && !resumeRequestedRef.current
              && now - mostRecentSpeechAt >= voiceSeconds * 1000) {
              resumeRequestedRef.current = true;
              resumeRef.current();
            }
          }

          if (analysisBusyRef.current) return;
          if (captureStartedAt === null) {
            preRollChunks.push(chunk);
            if (preRollChunks.length > 4) preRollChunks.shift();
            if (!speaking) return;
            captureChunks = [...preRollChunks];
            preRollChunks = [];
            captureStartedAt = now;
          } else {
            captureChunks.push(chunk);
          }

          if (speaking) {
            speakingMilliseconds += blockMilliseconds;
            lastSpeechInCaptureAt = now;
          }

          const silenceFinished = lastSpeechInCaptureAt !== null && now - lastSpeechInCaptureAt >= 700;
          const maximumLengthReached = now - captureStartedAt >= Math.min(
            12_000,
            Math.max(4_000, voiceSeconds * 1000 + 1_000),
          );
          if (!silenceFinished && !maximumLengthReached) return;

          const completedChunks = captureChunks;
          const completedSpeechMilliseconds = speakingMilliseconds;
          captureChunks = [];
          captureStartedAt = null;
          lastSpeechInCaptureAt = null;
          speakingMilliseconds = 0;
          if (completedSpeechMilliseconds < 400 || completedChunks.length === 0) return;

          const merged = mergeAudio(completedChunks);
          const resampled = resampleAudio(merged, event.inputBuffer.sampleRate);
          analysisBusyRef.current = true;
          setStates((current) => ({ ...current, voice: 'analyzing' }));
          workerRef.current?.postMessage({
            type: 'analyze',
            samples: resampled,
            speechMilliseconds: completedSpeechMilliseconds,
            language: speechLanguage,
          }, [resampled.buffer]);
        };
      } catch (error) {
        if (!cancelled) setStates((current) => ({ ...current, voice: sensorErrorState(error) }));
      }
    })();

    return () => {
      cancelled = true;
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') void audioContext.close();
      analysisBusyRef.current = false;
    };
  }, [monitoring, speechLanguage, voiceEnabled, voiceSeconds]);

  return states;
}
