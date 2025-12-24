/**
 * Export/Import Utility Module
 * 
 * Provides functionality for:
 * - JSON export/import of all application data (goals, constraints, sessions)
 * - ICS (iCalendar) export of weekly plans for calendar integration
 */

import { db, Goal, Constraint, Session, PlannerLog } from '../db/db';
import { DayPlan, Slot } from '../types/plan';

// ============ TYPES ============

export interface ExportData {
    version: string;
    exportedAt: string;
    data: {
        goals: Goal[];
        constraints: Constraint[];
        sessions: Session[];
        logs?: PlannerLog[];
    };
}

export interface ImportResult {
    success: boolean;
    message: string;
    imported?: {
        goals: number;
        constraints: number;
        sessions: number;
        logs?: number;
    };
    errors?: string[];
}

// ============ JSON EXPORT ============

/**
 * Exports all application data to a JSON object
 */
export async function exportToJSON(includeLogs: boolean = false): Promise<ExportData> {
    const goals = await db.goals.filter(g => !g.isDeleted).toArray();
    const constraints = await db.constraints?.filter(c => !c.isDeleted).toArray() ?? [];
    const sessions = await db.sessions.toArray();

    const exportData: ExportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: {
            goals: goals.map(g => ({
                ...g,
                // Convert Date objects to ISO strings for proper serialization
                deadline: g.deadline instanceof Date ? g.deadline.toISOString() as any : g.deadline,
            })),
            constraints,
            sessions: sessions.map(s => ({
                ...s,
                startTime: s.startTime instanceof Date ? s.startTime.toISOString() as any : s.startTime,
            })),
        }
    };

    if (includeLogs) {
        const logs = await db.logs.toArray();
        exportData.data.logs = logs;
    }

    return exportData;
}

/**
 * Downloads export data as a JSON file
 */
export function downloadJSON(data: ExportData, filename?: string): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `self-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export and download all data as JSON
 */
export async function exportAndDownloadJSON(includeLogs: boolean = false): Promise<void> {
    const data = await exportToJSON(includeLogs);
    downloadJSON(data);
}

// ============ JSON IMPORT ============

/**
 * Validates import data structure
 */
function validateImportData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        errors.push('Geçersiz dosya formatı: JSON objesi bekleniyor');
        return { valid: false, errors };
    }

    if (!data.version) {
        errors.push('Versiyon bilgisi eksik');
    }

    if (!data.data) {
        errors.push('Veri bloğu eksik');
        return { valid: false, errors };
    }

    if (!Array.isArray(data.data.goals)) {
        errors.push('Hedefler dizisi eksik veya geçersiz');
    }

    if (!Array.isArray(data.data.constraints)) {
        errors.push('Kısıtlar dizisi eksik veya geçersiz');
    }

    if (!Array.isArray(data.data.sessions)) {
        errors.push('Oturumlar dizisi eksik veya geçersiz');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Imports data from a JSON file
 */
export async function importFromJSON(
    file: File,
    options: {
        replaceExisting?: boolean; // If true, clears existing data before import
        skipDuplicates?: boolean;  // If true, skips items with same title
    } = {}
): Promise<ImportResult> {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate structure
        const validation = validateImportData(data);
        if (!validation.valid) {
            return {
                success: false,
                message: 'Veri doğrulama hatası',
                errors: validation.errors
            };
        }

        const { replaceExisting = false, skipDuplicates = true } = options;

        // If replacing, soft-delete existing data
        if (replaceExisting) {
            const existingGoals = await db.goals.toArray();
            const existingConstraints = await db.constraints?.toArray() ?? [];

            for (const goal of existingGoals) {
                await db.goals.update(goal.id!, { isDeleted: true, updatedAt: Date.now() });
            }
            for (const constraint of existingConstraints) {
                await db.constraints?.update(constraint.id!, { isDeleted: true, updatedAt: Date.now() });
            }
        }

        let importedGoals = 0;
        let importedConstraints = 0;
        let importedSessions = 0;
        let importedLogs = 0;

        // Import goals
        const existingGoalTitles = skipDuplicates
            ? new Set((await db.goals.filter(g => !g.isDeleted).toArray()).map(g => g.title.toLowerCase()))
            : new Set<string>();

        for (const goal of data.data.goals) {
            if (skipDuplicates && existingGoalTitles.has(goal.title.toLowerCase())) {
                continue;
            }

            // Don't import the old ID; let Dexie assign new ones
            const { id, ...goalData } = goal;
            await db.goals.add({
                ...goalData,
                deadline: goalData.deadline ? new Date(goalData.deadline) : undefined,
                status: goalData.status || 'active',
                isDeleted: false,
                updatedAt: Date.now()
            });
            importedGoals++;
        }

        // Import constraints
        const existingConstraintTitles = skipDuplicates
            ? new Set((await db.constraints?.filter(c => !c.isDeleted).toArray() ?? []).map(c => c.title.toLowerCase()))
            : new Set<string>();

        for (const constraint of data.data.constraints) {
            if (skipDuplicates && existingConstraintTitles.has(constraint.title.toLowerCase())) {
                continue;
            }

            const { id, ...constraintData } = constraint;
            await db.constraints?.add({
                ...constraintData,
                isDeleted: false,
                updatedAt: Date.now()
            });
            importedConstraints++;
        }

        // Import sessions (optional - we don't skip duplicates for sessions)
        for (const session of data.data.sessions) {
            const { id, ...sessionData } = session;
            await db.sessions.add({
                ...sessionData,
                startTime: new Date(sessionData.startTime),
                updatedAt: Date.now()
            });
            importedSessions++;
        }

        // Import logs if present
        if (data.data.logs && Array.isArray(data.data.logs)) {
            for (const log of data.data.logs) {
                const { id, ...logData } = log;
                await db.logs.add({
                    ...logData,
                    updatedAt: Date.now()
                });
                importedLogs++;
            }
        }

        return {
            success: true,
            message: `İçe aktarma başarılı!`,
            imported: {
                goals: importedGoals,
                constraints: importedConstraints,
                sessions: importedSessions,
                logs: importedLogs
            }
        };
    } catch (error) {
        return {
            success: false,
            message: `İçe aktarma hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
            errors: [String(error)]
        };
    }
}

// ============ ICS (iCalendar) EXPORT ============

const WEEK_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/**
 * Formats a Date to ICS datetime format (YYYYMMDDTHHmmss)
 */
function formatICSDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Generates a unique ID for ICS events
 */
function generateUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@self-planner`;
}

/**
 * Escapes special characters for ICS format
 */
function escapeICSText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Converts weekly plan slots to ICS events
 */
export function weeklyPlanToICS(plan: DayPlan[], weekStartDate?: Date): string {
    // Use current week's Monday as default
    const now = weekStartDate || new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const events: string[] = [];

    plan.forEach((day, dayIndex) => {
        const dayDate = new Date(monday);
        dayDate.setDate(monday.getDate() + dayIndex);

        // Group contiguous slots of the same type/label into single events
        let currentEvent: { type: string; label?: string; priority?: string; startMinutes: number; endMinutes: number } | null = null;

        day.slots.forEach((slot, slotIndex) => {
            if (slot.type === 'free') {
                // End current event if exists
                if (currentEvent) {
                    events.push(createICSEvent(dayDate, currentEvent));
                    currentEvent = null;
                }
                return;
            }

            // Check if we can extend current event
            if (currentEvent &&
                currentEvent.type === slot.type &&
                currentEvent.label === slot.label &&
                currentEvent.endMinutes === slot.startMinutes) {
                // Extend the event (30 minute slots)
                currentEvent.endMinutes = slot.startMinutes + 30;
            } else {
                // End previous event and start a new one
                if (currentEvent) {
                    events.push(createICSEvent(dayDate, currentEvent));
                }
                currentEvent = {
                    type: slot.type,
                    label: slot.label,
                    priority: slot.priority,
                    startMinutes: slot.startMinutes,
                    endMinutes: slot.startMinutes + 30
                };
            }
        });

        // Don't forget the last event of the day
        if (currentEvent) {
            events.push(createICSEvent(dayDate, currentEvent));
        }
    });

    // Build ICS file content
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SELF Learning Framework//Weekly Planner//TR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:SELF Haftalık Plan',
        'X-WR-TIMEZONE:Europe/Istanbul',
        ...events,
        'END:VCALENDAR'
    ].join('\r\n');

    return icsContent;
}

/**
 * Creates a single ICS event entry
 */
function createICSEvent(
    date: Date,
    event: { type: string; label?: string; priority?: string; startMinutes: number; endMinutes: number }
): string {
    const startDate = new Date(date);
    startDate.setHours(Math.floor(event.startMinutes / 60), event.startMinutes % 60, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(Math.floor(event.endMinutes / 60), event.endMinutes % 60, 0, 0);

    const summary = event.type === 'study'
        ? `📚 ${event.label || 'Çalışma'}`
        : event.type === 'busy'
            ? `🚫 ${event.label || 'Meşgul'}`
            : event.label || 'Etkinlik';

    const priorityLabel = event.priority === 'high' ? 'YÜKSEK'
        : event.priority === 'medium' ? 'ORTA'
            : event.priority === 'low' ? 'DÜŞÜK'
                : '';

    const description = [
        `Tip: ${event.type === 'study' ? 'Çalışma' : 'Kısıt'}`,
        priorityLabel ? `Öncelik: ${priorityLabel}` : '',
        'SELF Learning Framework tarafından oluşturuldu'
    ].filter(Boolean).join('\\n');

    return [
        'BEGIN:VEVENT',
        `UID:${generateUID()}`,
        `DTSTAMP:${formatICSDate(new Date())}`,
        `DTSTART:${formatICSDate(startDate)}`,
        `DTEND:${formatICSDate(endDate)}`,
        `SUMMARY:${escapeICSText(summary)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        event.type === 'study' ? 'CATEGORIES:STUDY,EDUCATION' : 'CATEGORIES:BUSY,BLOCKED',
        event.priority === 'high' ? 'PRIORITY:1' : event.priority === 'medium' ? 'PRIORITY:5' : 'PRIORITY:9',
        'STATUS:CONFIRMED',
        'END:VEVENT'
    ].join('\r\n');
}

/**
 * Downloads weekly plan as an ICS file
 */
export function downloadICS(plan: DayPlan[], filename?: string): void {
    const icsContent = weeklyPlanToICS(plan);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `self-haftalik-plan-${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Exports past study sessions to ICS format
 */
export async function sessionsToICS(): Promise<string> {
    const sessions = await db.sessions.toArray();
    const goals = await db.goals.toArray();
    const goalMap = new Map(goals.map(g => [g.id, g.title]));

    const events = sessions.map(session => {
        const startDate = new Date(session.startTime);
        const endDate = new Date(startDate.getTime() + session.duration * 60 * 1000);
        const goalTitle = goalMap.get(session.goalId) || 'Bilinmeyen Hedef';
        const statusEmoji = session.status === 'completed' ? '✅' : '⚠️';

        return [
            'BEGIN:VEVENT',
            `UID:session-${session.id}-${generateUID()}`,
            `DTSTAMP:${formatICSDate(new Date())}`,
            `DTSTART:${formatICSDate(startDate)}`,
            `DTEND:${formatICSDate(endDate)}`,
            `SUMMARY:${statusEmoji} ${escapeICSText(goalTitle)} (${session.duration} dk)`,
            `DESCRIPTION:Durum: ${session.status === 'completed' ? 'Tamamlandı' : 'Yarıda Kesildi'}\\nSüre: ${session.duration} dakika`,
            'CATEGORIES:STUDY,SESSION',
            'STATUS:CONFIRMED',
            'END:VEVENT'
        ].join('\r\n');
    });

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SELF Learning Framework//Study Sessions//TR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:SELF Çalışma Oturumları',
        'X-WR-TIMEZONE:Europe/Istanbul',
        ...events,
        'END:VCALENDAR'
    ].join('\r\n');
}

/**
 * Downloads sessions as ICS file
 */
export async function downloadSessionsICS(filename?: string): Promise<void> {
    const icsContent = await sessionsToICS();
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `self-oturumlar-${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
