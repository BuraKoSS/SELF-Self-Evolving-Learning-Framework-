import { db, PlannerLog } from "../db/db";
import { PlannerEvent, PlannerEventType } from "./events";

type Subscriber = (event: PlannerEvent) => void;

class ObserverAgent {
    private subscribers = new Map<PlannerEventType | "*", Set<Subscriber>>();

    subscribe(type: PlannerEventType | "*", cb: Subscriber) {
        const bucket = this.subscribers.get(type) ?? new Set<Subscriber>();
        bucket.add(cb);
        this.subscribers.set(type, bucket);

        return () => {
            const b = this.subscribers.get(type);
            if (!b) return;
            b.delete(cb);
            if (b.size === 0) this.subscribers.delete(type);
        };
    }

    async publish(event: PlannerEvent, persist: boolean = true) {
        const specific = this.subscribers.get(event.type);
        specific?.forEach((cb) => cb(event));

        const all = this.subscribers.get("*");
        all?.forEach((cb) => cb(event));

        if (persist) {
            const record: PlannerLog = {
                type: event.type,
                ts: event.ts,
                source: event.source,
                payload: event.payload,
            };

            try {
                await db.logs.add(record);
            } catch (err) {
                console.error("Log write failed:", err);
            }
        }
    }
}

export const observerAgent = new ObserverAgent();
