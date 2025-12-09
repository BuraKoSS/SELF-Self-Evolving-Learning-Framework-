import { observerAgent } from "./observerAgent";
import { createEvent, PlannerEventType } from "./events";

export async function logEvent<TPayload>(
    type: PlannerEventType,
    payload?: TPayload,
    source?: string,
    persist: boolean = true
) {
    const event = createEvent(type, payload, source);
    await observerAgent.publish(event, persist);
}
