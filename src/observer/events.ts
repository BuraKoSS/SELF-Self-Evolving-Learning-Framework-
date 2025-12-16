export const EVENT_TYPES = {
    GOAL_CREATED: "GOAL_CREATED",
    GOAL_DELETED: "GOAL_DELETED",
    CONSTRAINT_CREATED: "CONSTRAINT_CREATED",
    CONSTRAINT_DELETED: "CONSTRAINT_DELETED",
    SCHEDULER_RUN: "SCHEDULER_RUN",
    SLOT_MOVED: "SLOT_MOVED",
    FOCUS: "FOCUS",
    POSTPONE: "POSTPONE",
    CANCEL: "CANCEL",
    TUNER_POLICY_UPDATED: "TUNER_POLICY_UPDATED",
    TUNER_POLICY_APPLIED: "TUNER_POLICY_APPLIED",
    GUARDIAN_WARNING: "GUARDIAN_WARNING",
} as const;

export type PlannerEventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface PlannerEvent<TPayload = any> {
    type: PlannerEventType;
    ts: number;
    source?: string;
    payload?: TPayload;
}

export function createEvent<TPayload>(
    type: PlannerEventType,
    payload?: TPayload,
    source?: string
): PlannerEvent<TPayload> {
    return {
        type,
        ts: Date.now(),
        source,
        payload,
    };
}
