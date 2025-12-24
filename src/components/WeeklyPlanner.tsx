"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Goal, Constraint } from "../db/db";
import { logEvent } from "../observer/logging";
import { EVENT_TYPES } from "../observer/events";
import {
  patchWeeklyPlannerPolicy,
} from "../tuner/settingsStore";
import { SyncAgent } from "../lib/sync/SyncAgent";
import {
  DEFAULT_WEEKLY_PLANNER_POLICY,
  WeeklyPlannerPolicy,
  bucketForHour,
  clamp,
} from "../tuner/weeklyPlannerPolicy";
import { tuneWeeklyPlannerPolicyFromLogs } from "../tuner/TunerAgent";
import { SchedulerRule, SlotRationale, createRationale } from "../scheduler/rules";
import { Slot, SlotType, DayPlan } from "../types/plan";
import { analyzePlan } from "../guardian/GuardianAgent";
import { GuardianIssue } from "../guardian/types";

const WEEK_DAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

const START_HOUR = 9;
const END_HOUR = 22; // end boundary (exclusive)
const SLOT_MINUTES = 30;

// ---------------- Baseline Scheduler (rules + heuristics) ----------------

/**
 * Build an initial weekly plan from goals and constraints.
 * Rules:
 * - Start with all slots "free"
 * - Place constraint ("busy") hours on evening slots first (Respecting 'day' if exists)
 * - Distribute remaining study hours across the week (round-robin)
 * - Max X study hours per day (MAX_STUDY_HOURS_PER_DAY)
 */
function buildWeeklyPlan(
  goals: Goal[] = [],
  constraints: Constraint[] = [],
  policy: WeeklyPlannerPolicy = DEFAULT_WEEKLY_PLANNER_POLICY
): DayPlan[] {
  const slotsPerDay = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;

  // 1) Initialize all slots as "free"
  const days: DayPlan[] = WEEK_DAYS.map((dayName) => ({
    dayName,
    slots: Array.from(
      { length: slotsPerDay },
      (_, i): Slot => ({
        startMinutes: START_HOUR * 60 + i * SLOT_MINUTES,
        type: "free",
        rationale: createRationale(SchedulerRule.SLOT_FREE_AVAILABLE),
      })
    ),
  }));

  // 2) Place constraints (Updated to use specific Titles and Days)
  // We iterate through each constraint to preserve its identity (Title).

  for (const c of constraints) {
    let remainingSlots = Math.round(((c.duration || 0) * 60) / SLOT_MINUTES);

    // Kısıtın özel bir günü var mı kontrol et (Örn: "Pazartesi")
    const targetDayIndex = WEEK_DAYS.indexOf((c as any).day);

    // Heuristic: Akşamdan geriye doğru boş yer ara (slot bazlı)
    for (let s = slotsPerDay - 1; s >= 0 && remainingSlots > 0; s--) {
      if (targetDayIndex !== -1) {
        // --- SENARYO A: Belirli Bir Gün Seçilmiş (Örn: Salı) ---
        // Sadece o günün sütununa bak
        const slot = days[targetDayIndex].slots[s];
        if (slot.type === "free") {
          slot.type = "busy";
          slot.label = c.title; // - Kısıtın gerçek adını bas
          slot.priority = undefined;
          slot.rationale = createRationale(SchedulerRule.CONSTRAINT_SPECIFIC_DAY, {
            constraintTitle: c.title,
            dayName: WEEK_DAYS[targetDayIndex],
            startMinutes: slot.startMinutes,
          });
          remainingSlots--;
        } else {
          slot.rationale = createRationale(SchedulerRule.SLOT_ALREADY_OCCUPIED);
        }
      } else {
        // --- SENARYO B: Gün Seçilmemiş (Genel Kısıt) ---
        // Tüm günlere (Pzt->Paz) sırayla bak (Round-robin)
        for (let d = 0; d < days.length && remainingSlots > 0; d++) {
          const slot = days[d].slots[s];
          if (slot.type === "free") {
            slot.type = "busy";
            slot.label = c.title; // Kısıtın gerçek adını bas
            slot.priority = undefined;
            slot.rationale = createRationale(SchedulerRule.CONSTRAINT_GENERAL_DISTRIBUTION, {
              constraintTitle: c.title,
              dayName: WEEK_DAYS[d],
              startMinutes: slot.startMinutes,
            });
            remainingSlots--;
          }
        }
      }
    }
  }

  // 3) Distribute goals across the remaining free slots
  const goalStates = goals.map((g) => ({
    id: g.id,
    title: g.title,
    priority: g.priority,
    status: g.status, // Durumu al
    remainingMinutes: (g.targetHours || 0) * 60,
    deadline: g.deadline ? new Date(g.deadline) : undefined,
  }));

  if (goalStates.length === 0) return days;

  // Exam heuristic: if any active goal deadline is near, bias mornings more.
  const now = Date.now();
  const examSoon = goalStates.some((g) => {
    if (!g.deadline) return false;
    const diffDays = (g.deadline.getTime() - now) / (24 * 60 * 60 * 1000);
    return diffDays >= 0 && diffDays <= policy.examWindowDays;
  });

  const effectivePolicy: WeeklyPlannerPolicy = examSoon
    ? {
      ...policy,
      morningWeight: clamp(
        policy.morningWeight + policy.examMorningBoost,
        0.5,
        3
      ),
      eveningWeight: clamp(
        policy.eveningWeight - policy.examEveningPenalty,
        0.3,
        3
      ),
    }
    : policy;

  // Add exam rationale to all days if exam window is active
  if (examSoon) {
    days.forEach((day) => {
      day.slots.forEach((slot) => {
        if (slot.type === "free" && !slot.rationale) {
          slot.rationale = createRationale(SchedulerRule.EXAM_WINDOW_ACTIVE, {
            examWindowDays: policy.examWindowDays,
          });
        }
      });
    });
  }

  const bucketWeight = (bucket: "morning" | "midday" | "evening") => {
    if (bucket === "morning") return effectivePolicy.morningWeight;
    if (bucket === "evening") return effectivePolicy.eveningWeight;
    return effectivePolicy.middayWeight;
  };

  const isContiguousFree = (slots: Slot[], start: number, len: number) => {
    for (let i = 0; i < len; i++) {
      if (!slots[start + i] || slots[start + i].type !== "free") return false;
    }
    return true;
  };

  const placeBlock = (
    daySlots: Slot[],
    start: number,
    len: number,
    title: string,
    priority: any
  ) => {
    for (let i = 0; i < len; i++) {
      daySlots[start + i].type = "study";
      daySlots[start + i].label = title;
      daySlots[start + i].priority = priority;
    }
  };

  let currentGoalIndex = 0;
  const maxPerDaySlots = Math.floor(
    (effectivePolicy.maxStudyMinutesPerDay || 0) / SLOT_MINUTES
  );

  for (let d = 0; d < days.length; d++) {
    let usedTodaySlots = 0;

    // Keep placing blocks until we can't.
    while (usedTodaySlots < maxPerDaySlots) {
      // Stop if no remaining goals
      if (
        !goalStates.some(
          (g) => g.remainingMinutes > 0 && g.status !== "postponed"
        )
      )
        break;

      // Round-robin: find next active goal
      let loops = 0;
      while (
        (goalStates[currentGoalIndex].remainingMinutes <= 0 ||
          goalStates[currentGoalIndex].status === "postponed") &&
        loops < goalStates.length
      ) {
        currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
        loops++;
      }
      if (
        goalStates[currentGoalIndex].remainingMinutes <= 0 ||
        goalStates[currentGoalIndex].status === "postponed"
      ) {
        // Add rationale for skipped postponed goal
        const skippedGoal = goalStates[currentGoalIndex];
        if (skippedGoal.status === "postponed") {
          days[d].slots.forEach((slot) => {
            if (slot.type === "free" && !slot.rationale) {
              slot.rationale = createRationale(SchedulerRule.GOAL_POSTPONED_SKIPPED, {
                goalTitle: skippedGoal.title,
              });
            }
          });
        }
        break;
      }

      const g = goalStates[currentGoalIndex];
      const daySlots = days[d].slots;

      // Find best block placement in this day for this goal.
      let bestStart = -1;
      let bestLen = 0;
      let bestScore = -Infinity;
      let bestBucket: "morning" | "midday" | "evening" | null = null;

      for (let s = 0; s < daySlots.length; s++) {
        if (daySlots[s].type !== "free") {
          if (!daySlots[s].rationale) {
            daySlots[s].rationale = createRationale(SchedulerRule.CONSTRAINT_BLOCKED_SLOT);
          }
          continue;
        }
        if (usedTodaySlots >= maxPerDaySlots) {
          // Add rationale for daily limit
          if (!daySlots[s].rationale) {
            daySlots[s].rationale = createRationale(SchedulerRule.DAILY_STUDY_LIMIT_REACHED, {
              dailyLimit: maxPerDaySlots * SLOT_MINUTES / 60,
              usedToday: usedTodaySlots * SLOT_MINUTES / 60,
            });
          }
          break;
        }

        const startMinutes = daySlots[s].startMinutes;
        const hour = Math.floor(startMinutes / 60);
        const bucket = bucketForHour(hour, effectivePolicy);

        // Block length depends on bucket (evening shorter).
        const desiredMinutes =
          bucket === "evening"
            ? effectivePolicy.eveningStudyBlockMinutes
            : effectivePolicy.baseStudyBlockMinutes;
        const desiredSlots = Math.max(
          1,
          Math.round(desiredMinutes / SLOT_MINUTES)
        );

        const remainingSlotsForGoal = Math.max(
          1,
          Math.ceil(g.remainingMinutes / SLOT_MINUTES)
        );
        const remainingSlotsForDay = maxPerDaySlots - usedTodaySlots;
        const len = Math.min(
          desiredSlots,
          remainingSlotsForGoal,
          remainingSlotsForDay,
          daySlots.length - s
        );
        if (len <= 0) continue;
        if (!isContiguousFree(daySlots, s, len)) continue;

        // Score: time-bias weight + slight preference for earlier in day.
        const weight = bucketWeight(bucket);
        const timePenalty = (s / daySlots.length) * 0.08;
        const score = weight - timePenalty;

        if (score > bestScore) {
          bestScore = score;
          bestStart = s;
          bestLen = len;
          bestBucket = bucket;
        }
      }

      if (bestStart === -1 || bestLen === 0) break;

      // Place block with rationale
      const blockRationale = bestBucket === "morning"
        ? createRationale(SchedulerRule.GOAL_BLOCK_PLACED_MORNING, {
          goalTitle: g.title,
          priority: g.priority,
          dayName: WEEK_DAYS[d],
          startMinutes: daySlots[bestStart].startMinutes,
          blockLength: bestLen * SLOT_MINUTES,
          bucket: "morning",
          score: bestScore,
        })
        : bestBucket === "evening"
          ? createRationale(SchedulerRule.GOAL_BLOCK_PLACED_EVENING, {
            goalTitle: g.title,
            priority: g.priority,
            dayName: WEEK_DAYS[d],
            startMinutes: daySlots[bestStart].startMinutes,
            blockLength: bestLen * SLOT_MINUTES,
            bucket: "evening",
            score: bestScore,
          })
          : createRationale(SchedulerRule.GOAL_BLOCK_PLACED_MIDDAY, {
            goalTitle: g.title,
            priority: g.priority,
            dayName: WEEK_DAYS[d],
            startMinutes: daySlots[bestStart].startMinutes,
            blockLength: bestLen * SLOT_MINUTES,
            bucket: bestBucket || "midday",
            score: bestScore,
          });

      for (let i = 0; i < bestLen; i++) {
        daySlots[bestStart + i].rationale = blockRationale;
      }

      placeBlock(daySlots, bestStart, bestLen, g.title, g.priority);
      g.remainingMinutes -= bestLen * SLOT_MINUTES;
      usedTodaySlots += bestLen;
      currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
    }
  }

  return days;
}

// ---------------- Component ----------------

export default function WeeklyPlanner() {
  // Filter out soft-deleted goals and constraints
  const goals = useLiveQuery(() => db.goals.filter(g => !g.isDeleted).toArray());
  const constraints = useLiveQuery(() => db.constraints?.filter(c => !c.isDeleted).toArray() ?? []);

  const [plan, setPlan] = useState<DayPlan[]>([]);
  const [policy, setPolicy] = useState<WeeklyPlannerPolicy>(
    DEFAULT_WEEKLY_PLANNER_POLICY
  );
  const [tuneStatus, setTuneStatus] = useState<string>("");
  const [draggedSlot, setDraggedSlot] = useState<{
    dayIndex: number;
    slotIndex: number;
  } | null>(null);

  const [guardianIssues, setGuardianIssues] = useState<GuardianIssue[]>([]);

  useEffect(() => {
    const issues = analyzePlan(plan, goals ?? [], constraints ?? [], policy.maxStudyMinutesPerDay);
    setGuardianIssues(issues);
  }, [plan, goals, constraints, policy.maxStudyMinutesPerDay]);

  // Live query for policy settings - auto-updates when synced from other device
  const policyRecord = useLiveQuery(
    () => db.settings.get('weeklyPlannerPolicy'),
    []
  );

  // Update local policy state when policyRecord changes (from sync or local update)
  useEffect(() => {
    if (policyRecord?.value) {
      setPolicy({ ...DEFAULT_WEEKLY_PLANNER_POLICY, ...policyRecord.value });
    }
  }, [policyRecord]);

  useEffect(() => {
    if (goals && constraints) {
      const nextPlan = buildWeeklyPlan(goals, constraints, policy);
      setPlan(nextPlan);

      // Collect all rationales for logging
      const allRationales = nextPlan.flatMap(day =>
        day.slots
          .filter(slot => slot.rationale)
          .map(slot => slot.rationale!)
      );

      logEvent(
        EVENT_TYPES.SCHEDULER_RUN,
        {
          goalsCount: goals.length,
          constraintsCount: constraints.length,
          slotMinutes: policy.slotMinutes,
          baseStudyBlockMinutes: policy.baseStudyBlockMinutes,
          eveningStudyBlockMinutes: policy.eveningStudyBlockMinutes,
          weights: {
            morning: policy.morningWeight,
            midday: policy.middayWeight,
            evening: policy.eveningWeight,
          },
          rationalesCount: allRationales.length,
          rationales: allRationales,
        },
        "WeeklyPlanner"
      );
    }
  }, [goals, constraints, policy]);

  const totalStudyHours =
    goals?.reduce((sum, g) => sum + (g.targetHours || 0), 0) ?? 0;
  const totalBusyHours =
    constraints?.reduce((sum, c) => sum + (c.duration || 0), 0) ?? 0;

  const formatSlot = (startMinutes: number) => {
    const h = Math.floor(startMinutes / 60);
    const m = startMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const updatePolicyField = async <K extends keyof WeeklyPlannerPolicy>(
    key: K,
    value: WeeklyPlannerPolicy[K]
  ) => {
    const next = await patchWeeklyPlannerPolicy({
      [key]: value,
    } as Partial<WeeklyPlannerPolicy>);
    setPolicy(next);
  };

  const runAutoTune = async () => {
    setTuneStatus("Auto-tune çalışıyor...");
    try {
      const { policy: next, report } = await tuneWeeklyPlannerPolicyFromLogs(7);
      setPolicy(next);
      setTuneStatus(
        `Auto-tune OK. Değişiklik: ${Object.keys(report.changes).length
          ? JSON.stringify(report.changes)
          : "yok"
        }`
      );
    } catch (e) {
      setTuneStatus("Auto-tune başarısız.");
    }
  };

  // ---------- Drag & Drop Handlers (Aynı Kalıyor) ----------
  const handleDragStart = (dayIndex: number, slotIndex: number) => {
    const slot = plan[dayIndex].slots[slotIndex];
    if (slot.type === "free") return;
    setDraggedSlot({ dayIndex, slotIndex });
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    dayIndex: number,
    slotIndex: number
  ) => {
    const slot = plan[dayIndex].slots[slotIndex];
    if (slot.type !== "free") return;
    e.preventDefault();
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    dayIndex: number,
    slotIndex: number
  ) => {
    e.preventDefault();
    if (!draggedSlot) return;
    if (
      draggedSlot.dayIndex === dayIndex &&
      draggedSlot.slotIndex === slotIndex
    ) {
      setDraggedSlot(null);
      return;
    }

    const currentSource =
      plan[draggedSlot.dayIndex]?.slots[draggedSlot.slotIndex];
    const currentTarget = plan[dayIndex]?.slots[slotIndex];

    if (
      !currentSource ||
      !currentTarget ||
      currentSource.type === "free" ||
      currentTarget.type !== "free"
    ) {
      setDraggedSlot(null);
      return;
    }

    setPlan((prev) => {
      const copy = prev.map((d) => ({
        ...d,
        slots: d.slots.map((s) => ({ ...s })),
      }));
      const source = copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex];
      const target = copy[dayIndex].slots[slotIndex];

      // Swap logic
      copy[dayIndex].slots[slotIndex] = {
        ...target,
        type: source.type,
        label: source.label,
        priority: source.priority,
        rationale: source.rationale,
      };
      copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex] = {
        ...source,
        type: "free",
        label: undefined,
        priority: undefined,
        rationale: createRationale(SchedulerRule.SLOT_FREE_AVAILABLE),
      };

      return copy;
    });

    logEvent(
      EVENT_TYPES.SLOT_MOVED,
      { from: { day: draggedSlot.dayIndex }, to: { day: dayIndex } },
      "WeeklyPlanner"
    );
    setDraggedSlot(null);
  };

  const getStudyClassesByPriority = (priority?: "low" | "medium" | "high") => {
    switch (priority) {
      case "high":
        return "bg-red-50 text-red-700 border-red-200";
      case "medium":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "low":
      default:
        return "bg-green-50 text-green-700 border-green-200";
    }
  };

  return (
    <section className="w-full max-w-6xl mx-auto my-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">
            Haftalık Plan &amp; Zamanlayıcı
          </h2>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            Rules: Max {policy.maxStudyMinutesPerDay / 60} hours of study per
            day. Slot size: {SLOT_MINUTES}dk. First, constraint (busy) slots are
            blocked, then study goals are distributed across the week. The user
            can drag &amp; drop both study blocks and constraints onto free
            slots to adjust the schedule manually. Colors indicate priority
            (HIGH / MEDIUM / LOW).
          </p>
        </div>
        <div className="text-xs font-mono bg-blue-50 text-blue-800 px-4 py-2 rounded-lg border border-blue-100">
          <div>Hedeflenen: {totalStudyHours} Saat</div>
          <div>Dolu/Kısıt: {totalBusyHours} Saat</div>
        </div>
      </div>

      {/* Policy Controls */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="text-sm font-semibold text-gray-800">
            TunerAgent Policy (WeeklyPlanner)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => SyncAgent.getInstance().sync()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              🔄 Sync Settings
            </button>
            <button
              onClick={runAutoTune}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
            >
              Auto-tune (last 7 days logs)
            </button>
            <span className="text-[11px] text-gray-500">{tuneStatus}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <label className="text-xs text-gray-600">
            Base block (dk)
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.baseStudyBlockMinutes}
              min={30}
              step={30}
              onChange={(e) =>
                updatePolicyField(
                  "baseStudyBlockMinutes",
                  Number(e.target.value)
                )
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Evening block (dk)
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.eveningStudyBlockMinutes}
              min={30}
              step={30}
              onChange={(e) =>
                updatePolicyField(
                  "eveningStudyBlockMinutes",
                  Number(e.target.value)
                )
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Max/day (dk)
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.maxStudyMinutesPerDay}
              min={60}
              step={30}
              onChange={(e) =>
                updatePolicyField(
                  "maxStudyMinutesPerDay",
                  Number(e.target.value)
                )
              }
            />
          </label>

          <label className="text-xs text-gray-600">
            Morning weight
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.morningWeight}
              step={0.05}
              onChange={(e) =>
                updatePolicyField("morningWeight", Number(e.target.value))
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Midday weight
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.middayWeight}
              step={0.05}
              onChange={(e) =>
                updatePolicyField("middayWeight", Number(e.target.value))
              }
            />
          </label>
          <label className="text-xs text-gray-600">
            Evening weight
            <input
              className="mt-1 w-full border rounded-lg px-2 py-1 text-sm"
              type="number"
              value={policy.eveningWeight}
              step={0.05}
              onChange={(e) =>
                updatePolicyField("eveningWeight", Number(e.target.value))
              }
            />
          </label>
        </div>
      </div>

      {/* Guardian Agent Warnings */}
      {guardianIssues.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-red-800 font-bold">
            <span className="text-xl">🛡️</span> Guardian Agent: {guardianIssues.length} Sorun Tespit Edildi
          </div>
          <div className="space-y-2">
            {guardianIssues.map((issue, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-white p-3 rounded-lg border border-red-100 text-sm shadow-sm">
                <div className={`mt-0.5 w-2 h-2 rounded-full ${issue.severity === 'critical' ? 'bg-red-600' : 'bg-orange-400'}`} />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{issue.message}</div>
                  {issue.suggestedFix && (
                    <div className="text-gray-600 text-xs mt-1">
                      💡 Öneri: <span className="italic">{issue.suggestedFix.description}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {plan.map((day, dayIndex) => (
          <div
            key={day.dayName}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col"
          >
            <div className="bg-gray-50 p-3 border-b border-gray-100 font-bold text-center text-gray-700 text-sm">
              {day.dayName}
            </div>
            <div className="p-2 space-y-1 overflow-y-auto max-h-[500px]">
              {day.slots.map((slot, slotIndex) => {
                let cls =
                  "flex items-center text-[11px] px-2 py-1.5 rounded border transition-all ";

                if (slot.type === "free") {
                  cls += "bg-white border-dashed border-gray-200 text-gray-300";
                } else if (slot.type === "busy") {
                  cls +=
                    "bg-orange-100 border-orange-200 text-orange-800 font-semibold cursor-move hover:shadow-sm";
                } else if (slot.type === "study") {
                  cls +=
                    getStudyClassesByPriority(slot.priority) +
                    " font-medium cursor-move hover:shadow-sm";
                }

                return (
                  <div
                    key={`${day.dayName}-${slot.startMinutes}`}
                    className={`${cls} relative group`}
                    draggable={slot.type !== "free"}
                    onDragStart={() => handleDragStart(dayIndex, slotIndex)}
                    onDragOver={(e) => handleDragOver(e, dayIndex, slotIndex)}
                    onDrop={(e) => handleDrop(e, dayIndex, slotIndex)}
                    title={slot.rationale?.message || undefined}
                  >
                    <span className="font-mono opacity-50 w-10 text-xs">
                      {formatSlot(slot.startMinutes)}
                    </span>
                    <span className="truncate flex-1">
                      {/* - Kısıtın gerçek adını gösterir */}
                      {slot.type === "free" ? "-" : slot.label}
                    </span>
                    {slot.rationale && (
                      <div className="absolute left-full ml-2 top-0 z-50 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                        <div className="font-semibold mb-1">Neden?</div>
                        <div>{slot.rationale.message}</div>
                        {slot.rationale.details && (
                          <div className="mt-1 text-gray-300 text-[10px]">
                            {slot.rationale.details.goalTitle && `Hedef: ${slot.rationale.details.goalTitle}`}
                            {slot.rationale.details.constraintTitle && `Kısıt: ${slot.rationale.details.constraintTitle}`}
                            {slot.rationale.details.priority && `Öncelik: ${slot.rationale.details.priority}`}
                            {slot.rationale.details.bucket && `Zaman: ${slot.rationale.details.bucket}`}
                            {slot.rationale.details.blockLength && `Blok: ${slot.rationale.details.blockLength} dk`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
