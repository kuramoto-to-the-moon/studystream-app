# Third-party notices

StudyDot includes open-source software and fonts maintained by third parties.
The MIT license in `LICENSE` applies only to StudyDot's own source code. Each
third-party component remains subject to its own license.

This review reflects the versions resolved by `package-lock.json` and
`src-tauri/Cargo.lock` on 2026-09-01.

## Bundled fonts

| Component | Version | License | Attribution |
| --- | --- | --- | --- |
| Inter Variable via `@fontsource-variable/inter` | 5.3.0 (font v20) | SIL Open Font License 1.1 | Copyright 2016 The Inter Project Authors |
| Noto Sans JP Variable via `@fontsource-variable/noto-sans-jp` | 5.3.0 (font v56) | SIL Open Font License 1.1 | Google Inc. |

The complete license text and attribution notices are included in
`THIRD_PARTY_LICENSES/FONTS-OFL-1.1.txt`.

## Direct JavaScript dependencies

| Component | Resolved version | License |
| --- | --- | --- |
| React | 19.2.8 | MIT |
| React DOM | 19.2.8 | MIT |
| Vite | 8.2.2 | MIT |
| `@vitejs/plugin-react` | 6.1.1 | MIT |
| TypeScript | 7.0.2 | Apache-2.0 |
| Tauri CLI | 2.11.4 | Apache-2.0 OR MIT |
| `@types/node` | 26.4.0 | MIT |
| `@types/react` | 19.2.18 | MIT |
| `@types/react-dom` | 19.2.5 | MIT |
| Transformers.js | 3.8.1 | Apache-2.0 |
| Sharp (Node-only transitive dependency of Transformers.js) | 0.35.4 override | Apache-2.0 |
| Inter Variable package | 5.3.0 | OFL-1.1 |
| Noto Sans JP Variable package | 5.3.0 | OFL-1.1 |

## Optional local speech prototype

The current public beta build does not include or expose this prototype. Its
source and pinned local assets remain in the repository for dedicated builds
created with `VITE_ENABLE_VOICE_AUTO_PAUSE=true`.

| Component | Pinned source revision | License and attribution |
| --- | --- | --- |
| `onnx-community/whisper-tiny` quantized ONNX | `ff4177021cc41f7db950912b73ea4fdf7d01d8e7` | Apache-2.0; derived from OpenAI `whisper-tiny` |
| `Xenova/bge-small-en-v1.5` quantized ONNX | `ea104dacec62c0de699686887e3f920caeb4f3e3` | MIT; ONNX conversion of BAAI `bge-small-en-v1.5` |
| BAAI `bge-small-en-v1.5` base model | upstream of the ONNX model | MIT; Copyright (c) 2022 staoxiao |
| ONNX Runtime Web | 1.22.0 development build resolved by Transformers.js 3.8.1 | MIT; Copyright Microsoft Corporation |

Whisper Tiny converts Japanese or English speech to English. BGE Small embeds
that temporary text and a fixed set of StudyDot-authored representative
sentences; the app compares their semantic similarity locally. No training
corpus or transcript is redistributed or retained by StudyDot.

The pinned model-file hashes and the privacy/security review are documented in
`public/models/MANIFEST.sha256` and
`docs/local-speech-safety-and-licenses.md`.

The Apache License 2.0 text is included in
`THIRD_PARTY_LICENSES/APACHE-2.0.txt`.
The BGE/FlagEmbedding MIT license and copyright notice are included in
`THIRD_PARTY_LICENSES/BGE-MIT.txt`.

## Direct Rust dependencies

| Component | Resolved version | License |
| --- | --- | --- |
| Tauri | 2.11.5 | Apache-2.0 OR MIT |
| Tauri build | 2.6.3 | Apache-2.0 OR MIT |
| Tauri single-instance plugin | 2.4.3 | Apache-2.0 OR MIT |
| Axum | 0.8.9 | MIT |
| Tokio | 1.53.1 | MIT |
| async-stream | 0.3.6 | MIT |
| futures-core | 0.3.34 | MIT OR Apache-2.0 |
| mime_guess | 2.0.5 | MIT |
| rust-embed | 8.12.0 | MIT |
| serde_json | 1.0.151 | MIT OR Apache-2.0 |

## Transitive dependency review

All resolved npm and Cargo packages declared license metadata during this
review. The dependency trees use established open-source licenses, including
MIT, Apache-2.0, BSD, ISC, MPL-2.0, Unicode-3.0, Zlib, OFL-1.1, CC0 and the
Unlicense. No dependency was found that prevents StudyDot's own code from
being released under MIT.

Some transitive components use licenses such as MPL-2.0 that retain separate
notice or source-availability requirements for those components. Their terms
are not replaced by StudyDot's MIT license. Exact package names, versions
and dependency relationships are recorded in the two lockfiles. Desktop
release builds regenerate and include
`THIRD_PARTY_LICENSES/DEPENDENCIES.txt`, containing the installed packages,
SPDX declarations, source locations, and available license/NOTICE texts. It is
generated separately on each release platform so platform-specific packages
are covered.

The resolved dependency inventory contains no package without declared license
metadata. `sharp` is not included in StudyDot's browser/Tauri runtime bundle
and is not called by the application, but it is installed for Transformers.js'
Node entry point. StudyDot overrides it to 0.35.4 because earlier versions
inherit known libvips vulnerabilities. `npm audit --omit=dev` reported zero
known vulnerabilities after the override on the review date.

This file is an engineering inventory, not legal advice.
