'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Goal, Constraint } from '../db/db';

const WEEK_DAYS = [
    'Pazartesi',
    'Salı',
    'Çarşamba',
    'Perşembe',
    'Cuma',
    'Cumartesi',
    'Pazar',
];

const START_HOUR = 9;
const END_HOUR = 22; // last slot is 21–22
const MAX_STUDY_HOURS_PER_DAY = 6;

type SlotType = 'free' | 'study' | 'busy';

interface Slot {
    hour: number;
    type: SlotType;
    label?: string;
    priority?: 'low' | 'medium' | 'high';
}

interface DayPlan {
    dayName: string;
    slots: Slot[];
}

// ---------------- Baseline Scheduler (rules + heuristics) ----------------

/**
 * Build an initial weekly plan from goals and constraints.
 * Rules:
 *  - Start with all slots "free"
 *  - Place constraint ("busy") hours on evening slots first
 *  - Distribute remaining study hours across the week (round-robin)
 *  - Max X study hours per day (MAX_STUDY_HOURS_PER_DAY)
 */
function buildWeeklyPlan(
    goals: Goal[] = [],
    constraints: Constraint[] = []
): DayPlan[] {
    // 1) Initialize all slots as "free"
    const days: DayPlan[] = WEEK_DAYS.map((dayName) => ({
        dayName,
        slots: Array.from(
            { length: END_HOUR - START_HOUR },
            (_, i): Slot => ({
                hour: START_HOUR + i,
                type: 'free',
            })
        ),
    }));

    // 2) Calculate total busy hours from constraints and block them on evenings
    const totalBusyHours = constraints.reduce(
        (sum, c) => sum + (c.duration || 0),
        0
    );
    let remainingBusy = totalBusyHours;

    // Heuristic: fill busy hours from latest to earliest so daytime remains clearer for studying.
    for (
        let hour = END_HOUR - 1;
        hour >= START_HOUR && remainingBusy > 0;
        hour--
    ) {
        const slotIndex = hour - START_HOUR;
        for (let d = 0; d < days.length && remainingBusy > 0; d++) {
            const slot = days[d].slots[slotIndex];
            if (slot.type === 'free') {
                slot.type = 'busy';
                slot.label = 'Kısıt';
                slot.priority = undefined;
                remainingBusy--;
            }
        }
    }

    // 3) Distribute goals across the remaining free slots
    const goalStates = goals.map((g) => ({
        id: g.id,
        title: g.title,
        priority: g.priority,
        remaining: g.targetHours, // remaining hours to schedule
    }));

    if (goalStates.length === 0) return days;

    let currentGoalIndex = 0;

    for (let d = 0; d < days.length; d++) {
        let usedToday = 0;

        for (let s = 0; s < days[d].slots.length; s++) {
            const slot = days[d].slots[s];

            // Skip if slot already blocked or daily limit reached
            if (slot.type !== 'free') continue;
            if (usedToday >= MAX_STUDY_HOURS_PER_DAY) continue;

            // Stop if there is no remaining study hour at all
            if (!goalStates.some((g) => g.remaining > 0)) break;

            // Round-robin: find next goal that still has remaining hours
            let loops = 0;
            while (
                goalStates[currentGoalIndex].remaining <= 0 &&
                loops < goalStates.length
                ) {
                currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
                loops++;
            }

            if (goalStates[currentGoalIndex].remaining <= 0) break;

            // Assign this slot to the selected goal
            slot.type = 'study';
            slot.label = goalStates[currentGoalIndex].title;
            slot.priority = goalStates[currentGoalIndex].priority;
            goalStates[currentGoalIndex].remaining -= 1;
            usedToday++;

            // Move to next goal for fairness (round-robin)
            currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
        }
    }

    return days;
}

// ---------------- Component ----------------

export default function WeeklyPlanner() {
    const goals = useLiveQuery(() => db.goals.toArray());
    const constraints = useLiveQuery(() => db.constraints?.toArray() ?? []);

    // Plan is kept in local state so the user can adjust it via drag & drop
    const [plan, setPlan] = useState<DayPlan[]>([]);
    const [draggedSlot, setDraggedSlot] = useState<{
        dayIndex: number;
        slotIndex: number;
    } | null>(null);

    // Whenever goals or constraints change, rebuild baseline plan
    useEffect(() => {
        if (goals && constraints) {
            setPlan(buildWeeklyPlan(goals, constraints));
        }
    }, [goals, constraints]);

    const totalStudyHours =
        goals?.reduce((sum, g) => sum + (g.targetHours || 0), 0) ?? 0;
    const totalBusyHours =
        constraints?.reduce((sum, c) => sum + (c.duration || 0), 0) ?? 0;

    // ---------- Drag & Drop handlers ----------

    const handleDragStart = (dayIndex: number, slotIndex: number) => {
        const slot = plan[dayIndex].slots[slotIndex];
        // Only study blocks are draggable
        if (slot.type !== 'study') return;
        setDraggedSlot({ dayIndex, slotIndex });
    };

    const handleDragOver = (
        e: React.DragEvent<HTMLDivElement>,
        dayIndex: number,
        slotIndex: number
    ) => {
        const slot = plan[dayIndex].slots[slotIndex];
        // Do not allow dropping on "busy" (constraint) slots
        if (slot.type === 'busy') return;
        e.preventDefault(); // allow drop
    };

    const handleDrop = (
        e: React.DragEvent<HTMLDivElement>,
        dayIndex: number,
        slotIndex: number
    ) => {
        e.preventDefault();
        if (!draggedSlot) return;

        // If dropped on the same place, do nothing
        if (
            draggedSlot.dayIndex === dayIndex &&
            draggedSlot.slotIndex === slotIndex
        ) {
            setDraggedSlot(null);
            return;
        }

        setPlan((prev) => {
            // Deep copy so we don’t mutate previous state
            const copy = prev.map((d) => ({
                ...d,
                slots: d.slots.map((s) => ({ ...s })),
            }));

            const source = copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex];
            const target = copy[dayIndex].slots[slotIndex];

            // Only move study blocks and never overwrite a busy slot
            if (source.type !== 'study') return prev;
            if (target.type === 'busy') return prev;

            // MOVE behavior:
            //  - target becomes new study block (keeping priority)
            //  - source becomes free
            copy[dayIndex].slots[slotIndex] = {
                ...target,
                type: 'study',
                label: source.label,
                priority: source.priority,
            };

            copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex] = {
                ...source,
                type: 'free',
                label: undefined,
                priority: undefined,
            };

            return copy;
        });

        setDraggedSlot(null);
    };

    // Helper to choose Tailwind classes based on slot priority
    const getStudyClassesByPriority = (priority?: 'low' | 'medium' | 'high') => {
        switch (priority) {
            case 'high':
                return 'bg-red-50 text-red-700 border-red-200';
            case 'medium':
                return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'low':
            default:
                return 'bg-green-50 text-green-700 border-green-200';
        }
    };

    return (
        <section className="w-full max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                        Haftalık Plan &amp; Zamanlayıcı
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Rules: Max {MAX_STUDY_HOURS_PER_DAY} hours of study per day. First,
                        constraint (busy) slots are blocked, then study goals are distributed
                        across the week. The user can drag &amp; drop study blocks to adjust
                        the schedule manually. Colors indicate priority (HIGH / MEDIUM / LOW).
                    </p>
                </div>

                <div className="text-xs text-gray-600 bg-white rounded-lg shadow-sm border px-4 py-2 flex flex-col gap-1">
          <span>
            Total study target:{' '}
              <span className="font-semibold">{totalStudyHours} hours</span>
          </span>
                    <span>
            Total constrained time:{' '}
                        <span className="font-semibold">{totalBusyHours} hours</span>
          </span>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] mb-4">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />
          Study Block – HIGH priority
        </span>
                <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200" />
          Study Block – MEDIUM priority
        </span>
                <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200" />
          Study Block – LOW priority
        </span>
                <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-50 border border-orange-200" />
          Constraint / Busy Time
        </span>
                <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gray-50 border border-dashed border-gray-200" />
          Free / Unplanned
        </span>
            </div>

            {/* Weekly grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {plan.map((day, dayIndex) => (
                    <div
                        key={day.dayName}
                        className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col"
                    >
                        <h3 className="font-semibold text-sm text-gray-800 mb-2">
                            {day.dayName}
                        </h3>
                        <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                            {day.slots.map((slot, slotIndex) => {
                                let cls =
                                    'flex items-center justify-between text-[11px] px-2 py-1 rounded border cursor-default';

                                if (slot.type === 'free') {
                                    cls +=
                                        ' bg-gray-50 text-gray-400 border-dashed border-gray-200';
                                } else if (slot.type === 'busy') {
                                    cls += ' bg-orange-50 text-orange-700 border-orange-200';
                                } else if (slot.type === 'study') {
                                    cls +=
                                        ' ' + getStudyClassesByPriority(slot.priority) + ' cursor-move';
                                }

                                const draggable = slot.type === 'study';

                                return (
                                    <div
                                        key={`${day.dayName}-${slot.hour}-${slotIndex}`}
                                        className={cls}
                                        draggable={draggable}
                                        onDragStart={() =>
                                            handleDragStart(dayIndex, slotIndex)
                                        }
                                        onDragOver={(e) =>
                                            handleDragOver(e, dayIndex, slotIndex)
                                        }
                                        onDrop={(e) => handleDrop(e, dayIndex, slotIndex)}
                                    >
                    <span className="font-mono mr-2">
                      {slot.hour.toString().padStart(2, '0')}:00
                    </span>
                                        <span className="truncate flex-1">
                      {slot.type === 'free'
                          ? 'Boş'
                          : slot.label ??
                          (slot.type === 'busy' ? 'Kısıtlı' : '')}
                    </span>
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
