export function evaluateStageGate(attempts, recoveredConcepts, isBoss = false) {
  const total = Array.isArray(attempts) ? attempts.length : 0;
  const correct = (attempts || []).filter(attempt => attempt.correct).length;
  const accuracy = total ? correct / total : 0;
  const recovered = new Set(Array.isArray(recoveredConcepts) ? recoveredConcepts : []).size;
  const threshold = isBoss ? 0.8 : 0.75;
  const minimumAttempts = isBoss ? 12 : 8;
  return { passed: total >= minimumAttempts && accuracy >= threshold && recovered >= 2, accuracy, threshold, total, correct, recoveredConcepts: recovered, minimumAttempts };
}

export function nextDifficulty(recentOutcomes, current = "medium") {
  const outcomes = (recentOutcomes || []).slice(-2);
  const rank = { easy: 0, medium: 1, hard: 2 };
  let value = rank[current] ?? 1;
  if (outcomes.length === 2 && outcomes.every(Boolean)) value = Math.min(2, value + 1);
  if (outcomes.length === 2 && outcomes.every(x => !x)) value = Math.max(0, value - 1);
  return ["easy", "medium", "hard"][value];
}

export function xpForAnswer(correct, difficulty = "easy", usedHint = false) {
  if (!correct) return 0;
  const base = difficulty === "hard" ? 50 : difficulty === "medium" ? 30 : 20;
  return usedHint ? Math.max(5, base - 5) : base;
}

export function scheduleReview(quality, previousInterval = 0, ease = 2.5, repetitions = 0, now = new Date()) {
  const q = Math.max(0, Math.min(5, Number(quality) || 0));
  const nextEase = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const nextRepetitions = q < 3 ? 0 : repetitions + 1;
  const intervalDays = q < 3 ? 1 : nextRepetitions === 1 ? 1 : nextRepetitions === 2 ? 3 : Math.max(1, Math.round(Math.max(1, previousInterval) * nextEase));
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);
  return { ease: nextEase, repetitions: nextRepetitions, intervalDays, dueAt: dueAt.toISOString() };
}

export function getLevelFromXP(xp) {
  return Math.floor(Math.max(0, Number(xp) || 0) / 500) + 1;
}
