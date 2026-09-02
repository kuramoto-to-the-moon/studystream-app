# Local speech analysis: safety and licensing

Reviewed: 2026-09-01

Release status: withheld from the current public beta. Default builds do not
show the feature and do not copy the model or ONNX Runtime assets from
`public/`. This document covers the retained experimental implementation.

StudyDot's beta automatic-pause feature analyzes Japanese or English speech
on the user's device. It uses a quantized Whisper Tiny model to translate an
utterance to English and a quantized BGE Small semantic model to conservatively
compare it with StudyDot-authored conversation and study examples.

## Privacy and runtime boundaries

- The feature is off by default and requests microphone permission only after
  the user enables it.
- Camera access is never requested.
- Remote model loading and the browser model cache are disabled. All model
  assets are served by StudyDot's loopback-only local server.
- Raw audio exists only in memory for the current utterance. It is transferred
  to a dedicated worker, analyzed, and released; it is not written to disk.
- Translated text stays inside that worker. The UI receives only an intent,
  confidence, and utterance duration. Transcripts are not logged or persisted.
- ONNX Runtime uses one WASM thread. The worker is terminated whenever the
  feature is disabled, the timer is idle, or the user has paused manually.
- Automatic resume is permitted only after an automatic voice pause. A manual
  pause is normalized and stored as manual and cannot be resumed by the model.
- Local API writes reject cross-site browser requests. The server accepts only
  its fixed loopback Host values, places a 1 MiB limit on state writes, and
  requires JSON for state updates.

This feature is assistive rather than authoritative. Speech recognition and
semantic classification can be wrong, especially with background audio,
accents, short phrases, or domain-specific vocabulary. The decision threshold
is intentionally conservative to reduce false stops. Users can disable the
feature and always retain manual timer control.

## Model supply-chain controls

Only declarative tokenizer/configuration assets and ONNX graphs are bundled.
No Python pickle, custom executable model code, or remote-code loader is
included. Sources are pinned to immutable repository revisions:

| Bundled model | Pinned revision | Upstream license |
| --- | --- | --- |
| `onnx-community/whisper-tiny` | `ff4177021cc41f7db950912b73ea4fdf7d01d8e7` | Apache-2.0 (`openai/whisper-tiny`) |
| `Xenova/bge-small-en-v1.5` | `ea104dacec62c0de699686887e3f920caeb4f3e3` | MIT (`BAAI/bge-small-en-v1.5`) |

Release verification from the repository root:

```sh
shasum -a 256 -c public/models/MANIFEST.sha256
```

The ONNX graph hashes in the manifest match the files reported by the official
Hugging Face repositories at the pinned revisions.

## Measured footprint and acceptance checks

- Bundled model assets: approximately 79 MB before installer compression.
- Combined Whisper Tiny and BGE Small Node/WASM smoke tests: approximately
  687–703 MiB RSS while both models are loaded. This is an isolated process figure,
  not an exact whole-app prediction for every OS.
- The previous Whisper Base and DeBERTa candidate reached approximately
  1,164 MiB RSS and was rejected.
- A conservative 15-phrase English semantic smoke set produced no false
  conversation stop; 14 phrases were classified as intended and one study
  phrase remained uncertain. Japanese is translated to English first, so real
  microphones, accents, noise and Japanese domain vocabulary still require
  beta testing on both macOS and Windows.

The feature is therefore suitable for an opt-in beta, not for an always-on
default or a claim of perfect detection. It starts no model worker while off.

## Dependency and server checks

- 189 resolved npm packages and 501 resolved Cargo packages were inventoried;
  none lacked declared license metadata.
- The vulnerable Sharp 0.34 transitive version was overridden with patched
  Sharp 0.35.4. The app does not bundle or invoke its Node image decoder.
- `npm audit --omit=dev` reported zero known vulnerabilities on the review date.
- The production Rust server's Host and cross-origin write policies have unit
  coverage. The development server was smoke-tested for allowed reads/writes,
  invalid Host rejection, cross-origin write rejection, and JSON-only writes.

## License conclusion

The model publishers declare licenses that permit commercial use,
modification, and redistribution when their notice conditions are followed.
StudyDot includes the Apache-2.0 and BGE MIT texts and preserves attribution
in `THIRD_PARTY_NOTICES.md`. The app includes only model graphs, tokenizers and
configuration files; it does not include either model's training corpora.

This is an engineering license review, not legal advice. Before a paid or
large-scale release, have counsel confirm the model publishers' right to license
the released weights and review the complete generated dependency-license
bundle for the exact installer contents.
