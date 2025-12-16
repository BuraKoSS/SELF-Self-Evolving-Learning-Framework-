export type TimeOfDayBucket = 'morning' | 'midday' | 'evening';

export interface WeeklyPlannerPolicy {
  /** Slot resolution for scheduler/UI. Keep in sync with WeeklyPlanner rendering. */
  slotMinutes: 30;

  /** Default study block length (minutes). Example: 60, 90. */
  baseStudyBlockMinutes: number;

  /** Evening block length override (minutes). Example: 60 to keep evenings shorter. */
  eveningStudyBlockMinutes: number;

  /** Daily cap for study minutes (scheduler hard limit). */
  maxStudyMinutesPerDay: number;

  /** Morning window start/end hours (24h). */
  morningStartHour: number;
  morningEndHour: number;

  /** Evening window start/end hours (24h). */
  eveningStartHour: number;
  eveningEndHour: number;

  /**
   * Time-bias weights used by scheduler when choosing where to place blocks.
   * >1 means "prefer", <1 means "avoid".
   */
  morningWeight: number;
  middayWeight: number;
  eveningWeight: number;

  /**
   * Exam-week heuristic: if any goal deadline is within this window,
   * boost morningWeight and reduce eveningWeight.
   */
  examWindowDays: number;
  examMorningBoost: number;
  examEveningPenalty: number;
}

export const DEFAULT_WEEKLY_PLANNER_POLICY: WeeklyPlannerPolicy = {
  slotMinutes: 30,
  baseStudyBlockMinutes: 90,
  eveningStudyBlockMinutes: 60,
  maxStudyMinutesPerDay: 6 * 60,
  morningStartHour: 9,
  morningEndHour: 12,
  eveningStartHour: 18,
  eveningEndHour: 22,
  morningWeight: 1.35,
  middayWeight: 1.0,
  eveningWeight: 0.85,
  examWindowDays: 7,
  examMorningBoost: 0.35,
  examEveningPenalty: 0.2,
};

export const WEEKLY_PLANNER_POLICY_KEY = 'weeklyPlannerPolicy';

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function bucketForHour(
  hour: number,
  policy: Pick<
    WeeklyPlannerPolicy,
    'morningStartHour' | 'morningEndHour' | 'eveningStartHour' | 'eveningEndHour'
  >
): TimeOfDayBucket {
  if (hour >= policy.morningStartHour && hour < policy.morningEndHour) return 'morning';
  if (hour >= policy.eveningStartHour && hour < policy.eveningEndHour) return 'evening';
  return 'midday';
}


