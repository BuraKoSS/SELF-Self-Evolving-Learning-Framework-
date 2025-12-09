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

export class SelfDatabase extends Dexie {
  goals!: Table<Goal>;
  constraints!: Table<Constraint>;
  sessions!: Table<Session>;
  logs!: Table<PlannerLog>;

  constructor() {
    super('SelfDatabase');
    
    // Eski versiyonlar...
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
    
    // [YENİ] Versiyon 5: Goals tablosuna 'status' eklendi (Dexie otomatik halleder)
    this.version(5).stores({
        goals: '++id, title, deadline, priority, status',
        constraints: '++id, type, day',
        sessions: '++id, goalId, startTime, status',
        logs: '++id, type, ts'
    });
  }
}

export const db = new SelfDatabase();