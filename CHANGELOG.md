# Changelog

All notable changes to this project are documented here.

## [11.0.0] - 2026-11-18

### Added
- Configurable AI provider layer supporting Google Gemini and OpenAI-compatible chat-completions APIs.
- Provider configuration through `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, and `AI_FALLBACK_MODELS`.
- One JSON repair attempt followed by schema-shape validation for structured AI responses.
- Repository documentation, contribution and security guidance, issue templates, pull-request template, and CI workflow.

### Changed
- Updated default Gemini model configuration to current documented model IDs.
- Preserved `GEMINI_API_KEY` and `GEMINI_MODEL` as Gemini configuration fallbacks.
- Updated package metadata and version to 11.0.0.

### Preserved
- Topic Journey Engine, stage lessons, quiz sessions, stage-gate and remedial flow.
- Subject knowledge map, AI-assisted classification with local fallback, local progress storage, and progress export/import.
- Streaming AI Tutor and existing Gemini integration.

### Verification notes
- Provider integration is implemented for both paths. Real-key requests are not part of this release's automated checks; see README for the tested/untested status.
