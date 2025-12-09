import Dexie, { Table } from 'dexie';

export interface Goal {
  id?: number;
  title: string;
  targetHours: number;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
}

// YENİ EKLENEN KISIM: Kısıtlar (Örn: Bugün meşgulüm)
export interface Constraint {
  id?: number;
  title: string;       // Örn: "Salı Basketbol Antrenmanı"
  type: 'busy' | 'day_off';
  duration: number;    // Örn: 2 saat
}

// unified event log recor d
export interface PlannerLog{
  id?: number;
  type: string;       // GOAL_CREATED, SLOT_MOVED etc
  ts: number;  // Date.now()
  source?: string;    // GoalManager, WeeklyPlanner
  payload: any;       // flexible for minimuym viable product
}

export class SelfDatabase extends Dexie {
  goals!: Table<Goal>;
  constraints!: Table<Constraint>; // Yeni tablo
  logs!: Table<PlannerLog>;

  constructor() {
    super('SelfDatabase');
    // Versiyonu 2'ye çektik ki tarayıcı veritabanını güncellesin
    this.version(3).stores({
      goals: '++id, title, deadline, priority',
      constraints: '++id, type', // Yeni indeks
      logs: '++id, type, ts, source'
    });
  }
}

export const db = new SelfDatabase();