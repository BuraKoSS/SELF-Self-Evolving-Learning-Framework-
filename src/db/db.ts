import Dexie, { Table } from 'dexie';

export interface Goal {
  id?: number;
  title: string;
  targetHours: number;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  status?: 'active' | 'postponed' | 'completed'; // [YENİ] Durum alanı
}

export interface Constraint {
  id?: number;
  title: string;
  type: 'busy' | 'day_off';
  duration: number;
  day: string; // Kısıtın hangi günde olduğu
}

export interface Session {
  id?: number;
  goalId: number;
  startTime: Date;
  duration: number;
  status: 'completed' | 'interrupted';
}

export interface PlannerLog {
  id?: number;
  type: string;
  ts: number;
  source?: string;
  payload?: any;
}

export interface SettingRecord<TValue = any> {
  key: string;
  value: TValue;
  updatedAt: number;
}

export class SelfDatabase extends Dexie {
  goals!: Table<Goal>;
  constraints!: Table<Constraint>;
  sessions!: Table<Session>;
  logs!: Table<PlannerLog>;
  settings!: Table<SettingRecord>;

  constructor() {
    super('SelfDatabase');

    // Version 1-5 definitions (omitted for brevity, assume they exist as prior history)
    this.version(1).stores({
      goals: '++id, title, deadline, priority',
      sessions: '++id, goalId, startTime, status'
    });
    this.version(2).stores({
      goals: '++id, title, deadline, priority',
      constraints: '++id, type',
      sessions: '++id, goalId, startTime, status'
    });
    this.version(3).stores({
      goals: '++id, title, deadline, priority',
      constraints: '++id, type',
      sessions: '++id, goalId, startTime, status',
      logs: '++id, type, ts'
    });
    this.version(4).stores({
      goals: '++id, title, deadline, priority',
      constraints: '++id, type, day',
      sessions: '++id, goalId, startTime, status',
      logs: '++id, type, ts'
    });
    this.version(5).stores({
      goals: '++id, title, deadline, priority, status',
      constraints: '++id, type, day',
      sessions: '++id, goalId, startTime, status',
      logs: '++id, type, ts'
    });
    this.version(6).stores({
      goals: '++id, title, deadline, priority, status',
      constraints: '++id, type, day',
      sessions: '++id, goalId, startTime, status',
      logs: '++id, type, ts',
      settings: '&key, updatedAt'
    });

    // [NEW] Version 7: Add Sync metadata (updatedAt, isDeleted, version)
    // We add 'updatedAt' to indices for efficient sync querying
    this.version(7).stores({
      goals: '++id, title, deadline, priority, status, updatedAt',
      constraints: '++id, type, day, updatedAt',
      sessions: '++id, goalId, startTime, status, updatedAt',
      logs: '++id, type, ts, updatedAt',
      settings: '&key, updatedAt'
    }).upgrade(trans => {
      // Upgrade existing data to have default updatedAt
      const now = Date.now();
      trans.table('goals').toCollection().modify({ updatedAt: now, version: 1, isDeleted: false });
      trans.table('constraints').toCollection().modify({ updatedAt: now, version: 1, isDeleted: false });
      trans.table('sessions').toCollection().modify({ updatedAt: now, version: 1, isDeleted: false });
    });
  }
}

export const db = new SelfDatabase();