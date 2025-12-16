import { SlotRationale } from "../scheduler/rules";

export type SlotType = "free" | "study" | "busy";

export interface Slot {
  startMinutes: number; // minutes since 00:00
  type: SlotType;
  label?: string;
  priority?: "low" | "medium" | "high";
  rationale?: SlotRationale;
}

export interface DayPlan {
  dayName: string;
  slots: Slot[];
}
