import { db, SettingRecord } from '../db/db';
import { DEFAULT_WEEKLY_PLANNER_POLICY, WEEKLY_PLANNER_POLICY_KEY, WeeklyPlannerPolicy } from './weeklyPlannerPolicy';

export async function getWeeklyPlannerPolicy(): Promise<WeeklyPlannerPolicy> {
  try {
    const rec = await db.settings.get(WEEKLY_PLANNER_POLICY_KEY);
    if (!rec?.value) return DEFAULT_WEEKLY_PLANNER_POLICY;

    return { ...DEFAULT_WEEKLY_PLANNER_POLICY, ...(rec.value as Partial<WeeklyPlannerPolicy>) };
  } catch {
    return DEFAULT_WEEKLY_PLANNER_POLICY;
  }
}

export async function setWeeklyPlannerPolicy(policy: WeeklyPlannerPolicy) {
  const record: SettingRecord<WeeklyPlannerPolicy> = {
    key: WEEKLY_PLANNER_POLICY_KEY,
    value: policy,
    updatedAt: Date.now(),
  };
  await db.settings.put(record);
}

export async function patchWeeklyPlannerPolicy(patch: Partial<WeeklyPlannerPolicy>) {
  const current = await getWeeklyPlannerPolicy();
  const next: WeeklyPlannerPolicy = { ...current, ...patch };
  await setWeeklyPlannerPolicy(next);
  return next;
}
