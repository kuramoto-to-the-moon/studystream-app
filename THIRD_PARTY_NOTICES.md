# Third-party notices

StudyStream includes open-source software and fonts maintained by third parties.
The MIT license in `LICENSE` applies only to StudyStream's own source code. Each
third-party component remains subject to its own license.

This review reflects the versions resolved by `package-lock.json` and
`src-tauri/Cargo.lock` on 2026-08-31.

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
| Inter Variable package | 5.3.0 | OFL-1.1 |
| Noto Sans JP Variable package | 5.3.0 | OFL-1.1 |

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
Unlicense. No dependency was found that prevents StudyStream's own code from
being released under MIT.

Some transitive components use licenses such as MPL-2.0 that retain separate
notice or source-availability requirements for those components. Their terms
are not replaced by StudyStream's MIT license. Exact package names, versions
and dependency relationships are recorded in the two lockfiles. A release
build should include a generated complete dependency-license bundle in
addition to this summary.

This file is an engineering inventory, not legal advice.
