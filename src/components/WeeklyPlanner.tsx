'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Goal, Constraint } from '../db/db';
import { logEvent } from '../observer/logging';
import { EVENT_TYPES } from '../observer/events';
import { SchedulerRule, SlotRationale, createRationale } from '../scheduler/rules';

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
    rationale?: SlotRationale;
}

interface DayPlan {
    dayName: string;
    slots: Slot[];
}

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
                rationale: createRationale(SchedulerRule.SLOT_FREE_AVAILABLE),
            })
        ),
    }));

    // 2) Place constraints (Updated to use specific Titles and Days)
    // We iterate through each constraint to preserve its identity (Title).
    
    for (const c of constraints) {
        let remaining = c.duration || 0;
        
        // Kısıtın özel bir günü var mı kontrol et (Örn: "Pazartesi")
        const targetDayIndex = WEEK_DAYS.indexOf((c as any).day); 

        // Heuristic: Akşamdan (21:00) sabaha doğru boş yer ara
        for (let h = END_HOUR - 1; h >= START_HOUR && remaining > 0; h--) {
            const slotIndex = h - START_HOUR;

            if (targetDayIndex !== -1) {
                // --- SENARYO A: Belirli Bir Gün Seçilmiş (Örn: Salı) ---
                // Sadece o günün sütununa bak
                const slot = days[targetDayIndex].slots[slotIndex];
                if (slot.type === 'free') {
                    slot.type = 'busy';
                    slot.label = c.title; // - Kısıtın gerçek adını bas
                    slot.priority = undefined;
                    slot.rationale = createRationale(SchedulerRule.CONSTRAINT_SPECIFIC_DAY, {
                        constraintTitle: c.title,
                        dayName: WEEK_DAYS[targetDayIndex],
                        hour: h,
                    });
                    remaining--;
                } else {
                    slot.rationale = createRationale(SchedulerRule.SLOT_ALREADY_OCCUPIED);
                }
            } else {
                // --- SENARYO B: Gün Seçilmemiş (Genel Kısıt) ---
                // Tüm günlere (Pzt->Paz) sırayla bak (Round-robin)
                for (let d = 0; d < days.length && remaining > 0; d++) {
                    const slot = days[d].slots[slotIndex];
                    if (slot.type === 'free') {
                        slot.type = 'busy';
                        slot.label = c.title; // Kısıtın gerçek adını bas
                        slot.priority = undefined;
                        slot.rationale = createRationale(SchedulerRule.CONSTRAINT_GENERAL_DISTRIBUTION, {
                            constraintTitle: c.title,
                            dayName: WEEK_DAYS[d],
                            hour: h,
                        });
                        remaining--;
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
        remaining: g.targetHours,
    }));

    if (goalStates.length === 0) return days;

    let currentGoalIndex = 0;

    for (let d = 0; d < days.length; d++) {
        let usedToday = 0;

        for (let s = 0; s < days[d].slots.length; s++) {
            const slot = days[d].slots[s];

            // Skip if busy or daily limit reached
            if (slot.type !== 'free') {
                if (!slot.rationale) {
                    slot.rationale = createRationale(SchedulerRule.CONSTRAINT_BLOCKED_SLOT);
                }
                continue;
            }
            if (usedToday >= MAX_STUDY_HOURS_PER_DAY) {
                slot.rationale = createRationale(SchedulerRule.DAILY_STUDY_LIMIT_REACHED, {
                    dailyLimit: MAX_STUDY_HOURS_PER_DAY,
                    usedToday,
                });
                continue;
            }

            // Stop if no remaining goals
            if (!goalStates.some((g) => g.remaining > 0 && g.status !== 'postponed')) break;

            // Round-robin: find next active goal
            let loops = 0;
            while (
                (goalStates[currentGoalIndex].remaining <= 0 || goalStates[currentGoalIndex].status === 'postponed') &&
                loops < goalStates.length
            ) {
                currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
                loops++;
            }

            // Double check if we found a valid goal
            if (goalStates[currentGoalIndex].remaining <= 0 || goalStates[currentGoalIndex].status === 'postponed') {
                if (goalStates[currentGoalIndex].status === 'postponed') {
                    slot.rationale = createRationale(SchedulerRule.GOAL_POSTPONED_SKIPPED, {
                        goalTitle: goalStates[currentGoalIndex].title,
                    });
                }
                break;
            }

            // Assign slot
            slot.type = 'study';
            slot.label = goalStates[currentGoalIndex].title;
            slot.priority = goalStates[currentGoalIndex].priority;
            
            // Rationale: Priority-based or round-robin
            if (goalStates[currentGoalIndex].priority === 'high' && s < days[d].slots.length / 2) {
                slot.rationale = createRationale(SchedulerRule.HIGH_PRIORITY_GOAL_ALLOCATED_EARLIER, {
                    goalTitle: goalStates[currentGoalIndex].title,
                    priority: goalStates[currentGoalIndex].priority,
                    dayName: WEEK_DAYS[d],
                    hour: slot.hour,
                });
            } else {
                slot.rationale = createRationale(SchedulerRule.GOAL_ROUND_ROBIN_DISTRIBUTION, {
                    goalTitle: goalStates[currentGoalIndex].title,
                    priority: goalStates[currentGoalIndex].priority,
                    dayName: WEEK_DAYS[d],
                    hour: slot.hour,
                });
            }
            
            goalStates[currentGoalIndex].remaining -= 1;
            usedToday++;

            currentGoalIndex = (currentGoalIndex + 1) % goalStates.length;
        }
    }

    return days;
}

// ---------------- Component ----------------

export default function WeeklyPlanner() {
    const goals = useLiveQuery(() => db.goals.toArray());
    const constraints = useLiveQuery(() => db.constraints?.toArray() ?? []);

    const [plan, setPlan] = useState<DayPlan[]>([]);
    const [draggedSlot, setDraggedSlot] = useState<{
        dayIndex: number;
        slotIndex: number;
    } | null>(null);

    useEffect(() => {
        if (goals && constraints) {
            const nextPlan = buildWeeklyPlan(goals, constraints);
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
                    rationalesCount: allRationales.length,
                    rationales: allRationales,
                },
                'WeeklyPlanner'
            );
        }
    }, [goals, constraints]);

    const totalStudyHours = goals?.reduce((sum, g) => sum + (g.targetHours || 0), 0) ?? 0;
    const totalBusyHours = constraints?.reduce((sum, c) => sum + (c.duration || 0), 0) ?? 0;

    // ---------- Drag & Drop Handlers (Aynı Kalıyor) ----------
    const handleDragStart = (dayIndex: number, slotIndex: number) => {
        const slot = plan[dayIndex].slots[slotIndex];
        if (slot.type === 'free') return;
        setDraggedSlot({ dayIndex, slotIndex });
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, slotIndex: number) => {
        const slot = plan[dayIndex].slots[slotIndex];
        if (slot.type !== 'free') return;
        e.preventDefault(); 
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, slotIndex: number) => {
        e.preventDefault();
        if (!draggedSlot) return;
        if (draggedSlot.dayIndex === dayIndex && draggedSlot.slotIndex === slotIndex) {
            setDraggedSlot(null);
            return;
        }

        const currentSource = plan[draggedSlot.dayIndex]?.slots[draggedSlot.slotIndex];
        const currentTarget = plan[dayIndex]?.slots[slotIndex];

        if (!currentSource || !currentTarget || currentSource.type === 'free' || currentTarget.type !== 'free') {
            setDraggedSlot(null);
            return;
        }

        setPlan((prev) => {
            const copy = prev.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
            const source = copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex];
            const target = copy[dayIndex].slots[slotIndex];

            // Swap logic
            copy[dayIndex].slots[slotIndex] = { ...target, type: source.type, label: source.label, priority: source.priority, rationale: source.rationale };
            copy[draggedSlot.dayIndex].slots[draggedSlot.slotIndex] = { ...source, type: 'free', label: undefined, priority: undefined, rationale: undefined };

            return copy;
        });

        logEvent(EVENT_TYPES.SLOT_MOVED, { from: { day: draggedSlot.dayIndex }, to: { day: dayIndex } }, 'WeeklyPlanner');
        setDraggedSlot(null);
    };

    const getStudyClassesByPriority = (priority?: 'low' | 'medium' | 'high') => {
        switch (priority) {
            case 'high': return 'bg-red-50 text-red-700 border-red-200';
            case 'medium': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'low': default: return 'bg-green-50 text-green-700 border-green-200';
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
                        Rules: Max {MAX_STUDY_HOURS_PER_DAY} hours of study per day. First,
                        constraint (busy) slots are blocked, then study goals are distributed
                        across the week.
                        The user can drag &amp; drop both study blocks and
                        constraints onto free slots to adjust the schedule manually. Colors
                        indicate priority (HIGH / MEDIUM / LOW).
                    </p>
                </div>
                <div className="text-xs font-mono bg-blue-50 text-blue-800 px-4 py-2 rounded-lg border border-blue-100">
                    <div>Hedeflenen: {totalStudyHours} Saat</div>
                    <div>Dolu/Kısıt: {totalBusyHours} Saat</div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {plan.map((day, dayIndex) => (
                    <div key={day.dayName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                        <div className="bg-gray-50 p-3 border-b border-gray-100 font-bold text-center text-gray-700 text-sm">
                            {day.dayName}
                        </div>
                        <div className="p-2 space-y-1 overflow-y-auto max-h-[500px]">
                            {day.slots.map((slot, slotIndex) => {
                                let cls = 'flex items-center text-[11px] px-2 py-1.5 rounded border transition-all ';
                                
                                if (slot.type === 'free') {
                                    cls += 'bg-white border-dashed border-gray-200 text-gray-300';
                                } else if (slot.type === 'busy') {
                                    cls += 'bg-orange-100 border-orange-200 text-orange-800 font-semibold cursor-move hover:shadow-sm';
                                } else if (slot.type === 'study') {
                                    cls += getStudyClassesByPriority(slot.priority) + ' font-medium cursor-move hover:shadow-sm';
                                }

                                return (
                                    <div
                                        key={`${day.dayName}-${slot.hour}`}
                                        className={`${cls} relative group`}
                                        draggable={slot.type !== 'free'}
                                        onDragStart={() => handleDragStart(dayIndex, slotIndex)}
                                        onDragOver={(e) => handleDragOver(e, dayIndex, slotIndex)}
                                        onDrop={(e) => handleDrop(e, dayIndex, slotIndex)}
                                        title={slot.rationale?.message || undefined}
                                    >
                                        <span className="font-mono opacity-50 w-10 text-xs">
                                            {slot.hour}:00
                                        </span>
                                        <span className="truncate flex-1">
                                            {/* - Kısıtın gerçek adını gösterir */}
                                            {slot.type === 'free' ? '-' : slot.label}
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