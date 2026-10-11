# Changelog

## v10.0.0 — Topic Journey Engine

- Added structured Gemini endpoints for learning paths, micro-lessons, stage quizzes, written-answer grading and remedial lessons.
- Custom topic creation now generates a 5–6 stage path before saving the topic.
- Added stage map, cached micro-lessons, worked examples, hints, answer feedback, stage gates and targeted remedial flow.
- Quiz answer keys and post-answer explanations are kept server-side until submission.
- Added versioned `sd:v2` local persistence with legacy-key migration and progress export/import.
- Removed the old generic two-question fallback battle and stopped awarding XP for ordinary tutor messages.
- Dashboard metrics now use recorded activity or honest empty states instead of placeholder mastery values.
- Added model startup check, tighter default CORS, request-size limits, basic rate limiting, response headers, and improved streaming idle timeout behavior.
- Added unit tests for stage gates, XP math, difficulty helper, level math and spaced-review scheduling.

## Known gaps

See README's Known limitations section. The app was syntax-checked and utility tests were run; dependency installation timed out in this environment, so the production build and browser end-to-end flow are not certified.

## Subject Knowledge Map update
- Added a versioned subject catalog with stable IDs, aliases, safe migration of legacy custom topics, XP and recorded attempts.
- Added single-topic and batch Gemini subject-classification endpoints plus local keyword fallback and Unsorted handling.
- Made Dungeons subject cards keyboard-accessible buttons and added hash-based subject detail navigation.
- Added subject details, activity-derived accuracy, topic movement, subject rename/icon/color, merge/delete controls, and weakest-concept revision actions.
- Added subject badges and subject filters to Dashboard and Quests; My Topics cards now show their linked subject.
- Added unit tests for normalization, aliases, classification fallback, migration, aggregation, and subject operations.
