import { cos_sim, env, pipeline } from '@huggingface/transformers';
import {
  averageTopScores,
  classifySpeechIntent,
  CONVERSATION_EXAMPLES,
  STUDY_EXAMPLES,
} from '../features/autoPause/intentClassifier';

const ortWasmModuleUrl = new URL(
  '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
  import.meta.url,
).href;
const ortWasmBinaryUrl = new URL(
  '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
  import.meta.url,
).href;

type WorkerRequest =
  | { type: 'prepare' }
  | { type: 'analyze'; samples: Float32Array; speechMilliseconds: number; language: 'ja' | 'en' };

type TranscriptionResult = { text?: string } | Array<{ text?: string }>;
type EmbeddingResult = {
  tolist: () => number[][];
};

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: ortWasmModuleUrl,
    wasm: ortWasmBinaryUrl,
  };
  // Keep inference predictable beside OBS. The worker is destroyed when the
  // feature is off, so model memory is released instead of remaining resident.
  env.backends.onnx.wasm.numThreads = 1;
}

let transcriberPromise: Promise<unknown> | null = null;
let classifierPromise: Promise<unknown> | null = null;

function getTranscriber() {
  transcriberPromise ??= pipeline(
    'automatic-speech-recognition',
    'onnx-community/whisper-tiny',
    { device: 'wasm', dtype: 'q8', local_files_only: true },
  );
  return transcriberPromise;
}

function getClassifier() {
  classifierPromise ??= pipeline(
    'feature-extraction',
    'Xenova/bge-small-en-v1.5',
    { device: 'wasm', dtype: 'q8', local_files_only: true },
  );
  return classifierPromise;
}

async function prepare() {
  await Promise.all([getTranscriber(), getPrototypeEmbeddings()]);
  self.postMessage({ type: 'ready' });
}

let prototypeEmbeddingsPromise: Promise<{
  conversation: number[][];
  study: number[][];
}> | null = null;

function getPrototypeEmbeddings() {
  prototypeEmbeddingsPromise ??= (async () => {
    const classifier = await getClassifier();
    const output = await (classifier as unknown as (
      input: string[],
      options: Record<string, unknown>,
    ) => Promise<EmbeddingResult>)(
      [...CONVERSATION_EXAMPLES, ...STUDY_EXAMPLES],
      { pooling: 'mean', normalize: true },
    );
    const vectors = output.tolist();
    return {
      conversation: vectors.slice(0, CONVERSATION_EXAMPLES.length),
      study: vectors.slice(CONVERSATION_EXAMPLES.length),
    };
  })();
  return prototypeEmbeddingsPromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.type === 'prepare') {
      await prepare();
      return;
    }

    const [transcriber, classifier, prototypes] = await Promise.all([
      getTranscriber(),
      getClassifier(),
      getPrototypeEmbeddings(),
    ]);
    const output = await (transcriber as unknown as (
      input: Float32Array,
      options: Record<string, unknown>,
    ) => Promise<TranscriptionResult>)(event.data.samples, {
      // Whisper's multilingual checkpoint translates both Japanese and English
      // into the English input expected by the compact semantic model.
      task: 'translate',
      language: event.data.language === 'ja' ? 'japanese' : 'english',
      chunk_length_s: 15,
      stride_length_s: 2,
    });
    const text = (Array.isArray(output)
      ? output.map((item) => item.text ?? '').join(' ')
      : output.text ?? '').replace(/\s+/g, ' ').trim();

    if (text.length < 4) {
      self.postMessage({
        type: 'result',
        intent: 'uncertain',
        confidence: 0,
        speechMilliseconds: event.data.speechMilliseconds,
      });
      return;
    }

    const classified = await (classifier as unknown as (
      input: string[],
      options: Record<string, unknown>,
    ) => Promise<EmbeddingResult>)(
      [text],
      { pooling: 'mean', normalize: true },
    );
    const [textVector] = classified.tolist();
    const conversationScore = averageTopScores(
      prototypes.conversation.map((prototype) => cos_sim(textVector, prototype)),
    );
    const studyScore = averageTopScores(
      prototypes.study.map((prototype) => cos_sim(textVector, prototype)),
    );
    const intent = classifySpeechIntent({
      textLength: text.length,
      conversationScore,
      studyScore,
    });

    // Deliberately return only the decision. Raw audio and translated text
    // never leave this worker and are discarded after each inference.
    self.postMessage({
      type: 'result',
      intent,
      confidence: Math.max(conversationScore, studyScore),
      speechMilliseconds: event.data.speechMilliseconds,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'local-speech-analysis-failed',
    });
  }
};
