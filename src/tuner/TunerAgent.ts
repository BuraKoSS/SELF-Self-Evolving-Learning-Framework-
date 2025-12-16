import { EVENT_TYPES } from '../observer/events';
import { logEvent } from '../observer/logging';
import { db } from '../db/db';
import { loadPrefs, savePrefs } from './UserPrefs';
import {
  DEFAULT_WEEKLY_PLANNER_POLICY,
  WeeklyPlannerPolicy,
  bucketForHour,
  clamp,
} from './weeklyPlannerPolicy';
import { getWeeklyPlannerPolicy, setWeeklyPlannerPolicy } from './settingsStore';

export function tunePomodoroSettings() {
  const prefs = loadPrefs();

  let newLength = prefs.pomodoroLength;

  if (prefs.failedSessions >= 3) {
    newLength = 20;
  } else if (prefs.completedSessions >= 5) {
    newLength = 30;
  }

  if (newLength !== prefs.pomodoroLength) {
    // fire-and-forget (non-blocking)
    logEvent(EVENT_TYPES.TUNER_POLICY_UPDATED, {
      kind: 'pomodoroLength',
      old: prefs.pomodoroLength,
      new: newLength,
    }, 'TunerAgent', true).catch(() => {});
  }

  prefs.pomodoroLength = newLength;
  savePrefs(prefs);

  return prefs;
}


export interface WeeklyTuningReport {
  fromTs: number;
  toTs: number;
  counts: {
    morning: { focus: number; negative: number };
    midday: { focus: number; negative: number };
    evening: { focus: number; negative: number };
  };
  changes: Partial<WeeklyPlannerPolicy>;
}

function hourFromTs(ts: number) {
  return new Date(ts).getHours();
}

function safeRate(pos: number, neg: number) {
  const denom = pos + neg;
  if (denom === 0) return 0;
  return neg / denom;
}

/**
 * Heuristic:
 * - If evenings have a high negative rate (POSTPONE/CANCEL) => reduce eveningWeight, keep evening blocks shorter.
 * - If mornings show strong focus with low negatives => increase morningWeight, allow longer base blocks.
 * - If overall negatives dominate => shorten base blocks slightly.
 */
export async function tuneWeeklyPlannerPolicyFromLogs(
  lookbackDays: number = 7
): Promise<{ policy: WeeklyPlannerPolicy; report: WeeklyTuningReport }> {
  const toTs = Date.now();
  const fromTs = toTs - lookbackDays * 24 * 60 * 60 * 1000;

  const logs = await db.logs.where('ts').above(fromTs).toArray();

  const current = await getWeeklyPlannerPolicy();
  const next: WeeklyPlannerPolicy = { ...DEFAULT_WEEKLY_PLANNER_POLICY, ...current };

  const counts = {
    morning: { focus: 0, negative: 0 },
    midday: { focus: 0, negative: 0 },
    evening: { focus: 0, negative: 0 },
  } as WeeklyTuningReport['counts'];

  for (const e of logs) {
    if (e.type !== EVENT_TYPES.FOCUS && e.type !== EVENT_TYPES.POSTPONE && e.type !== EVENT_TYPES.CANCEL) continue;
    const hour = hourFromTs(e.ts);
    const bucket = bucketForHour(hour, next);
    if (e.type === EVENT_TYPES.FOCUS) counts[bucket].focus += 1;
    else counts[bucket].negative += 1;
  }

  const eveningNegRate = safeRate(counts.evening.focus, counts.evening.negative);
  const morningNegRate = safeRate(counts.morning.focus, counts.morning.negative);
  const overallNegRate = safeRate(
    counts.morning.focus + counts.midday.focus + counts.evening.focus,
    counts.morning.negative + counts.midday.negative + counts.evening.negative
  );

  const changes: Partial<WeeklyPlannerPolicy> = {};

  // Evening pain: avoid loading evenings heavily and shorten blocks.
  if (counts.evening.negative >= 3 && eveningNegRate >= 0.6) {
    changes.eveningWeight = clamp(next.eveningWeight - 0.1, 0.55, 1.0);
    changes.eveningStudyBlockMinutes = 60;
  }

  // Morning strong: load more into mornings.
  if (counts.morning.focus >= 3 && morningNegRate <= 0.25) {
    changes.morningWeight = clamp(next.morningWeight + 0.08, 1.0, 2.0);
    changes.baseStudyBlockMinutes = clamp(next.baseStudyBlockMinutes, 60, 120);
    if (changes.baseStudyBlockMinutes < 90) changes.baseStudyBlockMinutes = 90;
  }

  // Overall struggle: shorten default blocks slightly.
  if (counts.morning.negative + counts.midday.negative + counts.evening.negative >= 5 && overallNegRate >= 0.55) {
    changes.baseStudyBlockMinutes = 60;
  }

  // Apply changes if any.
  const hasChanges = Object.keys(changes).length > 0;
  const finalPolicy = hasChanges ? ({ ...next, ...changes } as WeeklyPlannerPolicy) : next;

  if (hasChanges) {
    await setWeeklyPlannerPolicy(finalPolicy);
    await logEvent(
      EVENT_TYPES.TUNER_POLICY_UPDATED,
      { kind: 'weeklyPlannerPolicy', fromTs, toTs, counts, changes, old: current, next: finalPolicy },
      'TunerAgent'
    );
  }

  return { policy: finalPolicy, report: { fromTs, toTs, counts, changes } };
}


