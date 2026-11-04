# Folio AI Store release readiness

Status target: `READY_FOR_AUTO_UPLOAD_HANDOFF` after the final Actions artifact and Windows-checker DRY_RUN are verified.

## Completed

- Store version changed from QA-only `1.0.2.1` to `1.0.3.0` (reserved fourth field is zero).
- Partner Center supplied Identity, Publisher, Publisher display name, and x64 architecture are asserted by tests and rechecked after MakeAppx unpack.
- Python Ollama tests: 8 PASS.
- Python search/data tests: 14 PASS.
- Store configuration tests added.
- Windows Edge UI automation covers 1920×1080, 1280×720, 1024×768, and 720×750.
- GUI deletion is verified through the UI, directly in SQLite, after server restart, and against an unrelated retained record.
- TXT, CSV, Markdown, and JSON import plus body search are verified.
- Five 1920×1080 Store screenshots use synthetic data.
- An optional 1920×1080 Store trailer and thumbnail are generated and codec-validated in Windows Actions; they are not uploaded in this task.
- Core search, registration, full text, and deletion remain usable without Ollama.
- Network listeners and Ollama calls are limited to loopback; hostile Origin requests are rejected by the server.

## Real-device evidence and scope

The 1.0.2.1 candidate with the same application payload passed prior Windows 11 installation, update/data retention, WebView2, real Ollama `qwen3:0.6b`, restart recognition, and loopback security QA. Version 1.0.3.0 changes the Store version and release packaging metadata; it does not change the Folio production application payload.

On 2026-11-05, the local device's enterprise application-control policy blocked a newly generated unsigned PyInstaller EXE and local ffmpeg before execution. Code Integrity recorded events 3033 and 3077 for the unsigned local EXE under policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`; AppModel-Runtime and Application had no matching Folio event in the same query. Protection was not disabled and the build did not bypass its self-test. Final 1.0.3.0 pack/unpack, SHA fixation, and trailer encoding must therefore come from the clean Windows GitHub Actions runner. This is an expected signing-policy rejection of unsigned local tools, not evidence of an application crash. Microsoft Store re-signing and Partner Center validation remain required.

## Remaining gates

- Final GitHub Actions package and handoff SHA verification.
- Windows-checker validation and Windows-Automator `dry_run` only.
- Partner Center package validation/certification (future separate authorized step).
- Final WACK was not completed locally; prior WACK produced a warning and Partner Center validation remains authoritative for the unsigned Store package.

No Partner Center state has been modified.

