import { DayPlan, Slot } from "../types/plan";
import { Goal, Constraint } from "../db/db";
import { GuardianIssue } from "./types";
import { EVENT_TYPES } from "../observer/events";
import { logEvent } from "../observer/logging";

/**
 * Analyzes the weekly plan for potential issues.
 */
export function analyzePlan(
    plan: DayPlan[],
    goals: Goal[],
    constraints: Constraint[],
    maxStudyMinutesPerDay: number
): GuardianIssue[] {
    const issues: GuardianIssue[] = [];
    const now = new Date();

    // 1. Check for Conflicts (Soft check - since scheduler avoids conflicts, we look for manual overlaps or errors)
    // Note: The current Slot structure aligns slots by time, making physical overlap impossible in the grid,
    // but we can check if a constraint was overwritten or ignored.
    // For now, let's assume the grid ensures no literal time overlap.

    // 2. Check for Overload
    plan.forEach(day => {
        const studyMinutes = day.slots.reduce((acc, slot) => {
            return slot.type === 'study' ? acc + 30 : acc;
        }, 0);

        if (studyMinutes > maxStudyMinutesPerDay) {
            issues.push({
                type: 'OVERLOAD',
                severity: 'warning',
                message: `${day.dayName}: Günlük çalışma limiti aşıldı (${studyMinutes / 60}sa / ${maxStudyMinutesPerDay / 60}sa).`,
                relatedDate: day.dayName,
                suggestedFix: {
                    action: 'reduce',
                    description: 'Bazı çalışma bloklarını başka güne taşıyın veya azaltın.'
                }
            });
        }
    });

    // 3. Exam Proximity & Missed Deadlines
    goals.forEach(g => {
        if (!g.deadline) return;

        const deadline = new Date(g.deadline);
        const diffTime = deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0 && g.status !== 'completed') {
            issues.push({
                type: 'MISSED_DEADLINE',
                severity: 'critical',
                message: `"${g.title}" hedefinin süresi dolmuş (${Math.abs(diffDays)} gün önce).`,
                relatedGoalId: g.id,
                suggestedFix: {
                    action: 'ignore', // Or maybe reschedule?
                    description: 'Hedefi tamamlandı olarak işaretleyin veya yeni bir tarih belirleyin.'
                }
            });
        } else if (diffDays >= 0 && diffDays <= 3 && g.status !== 'completed') {
            // Check if we have enough blocks scheduled for this goal
            const goalBlocks = plan.flatMap(d => d.slots).filter(s => s.label === g.title).length;
            const assignedMinutes = goalBlocks * 30;
            const neededMinutes = (g.targetHours * 60); // This is total target, ideally we check remaining.
            // Assume targetHours is what's left for simplicity or we'd need tracking of "completed" amount.

            // If assigned is significantly less than target in this crunch time
            if (assignedMinutes < neededMinutes * 0.5) {
                issues.push({
                    type: 'EXAM_PROXIMITY',
                    severity: 'warning',
                    message: `"${g.title}" için son ${diffDays} gün! Planlanan çalışma yetersiz görünüyor.`,
                    relatedGoalId: g.id,
                    suggestedFix: {
                        action: 'move',
                        description: 'Bu hedefe daha fazla öncelik verin.'
                    }
                });
            }
        }
    });

    // Log issues if any
    if (issues.length > 0) {
        logEvent(EVENT_TYPES.GUARDIAN_WARNING, {
            issueCount: issues.length,
            issues: issues
        }, 'GuardianAgent');
    }

    return issues;
}
