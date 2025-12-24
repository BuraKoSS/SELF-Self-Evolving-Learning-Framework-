import Dexie, { Table } from 'dexie';

export interface Goal {
  id?: number;
  title: string;
  targetHours: number;
  priority: 'low' | 'medium' | 'high';
  deadline?: Date;
  status?: 'active' | 'postponed' | 'completed';
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface Constraint {
  id?: number;
  title: string;
  type: 'busy' | 'day_off';
  duration: number;
  day: string;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface Session {
  id?: number;
  goalId: number;
  startTime: Date;
  duration: number;
  status: 'completed' | 'interrupted';
  updatedAt?: number;
}

export interface PlannerLog {
  id?: number;
  type: string;
  ts: number;
  source?: string;
  payload?: any;
  updatedAt?: number;
}

export interface SettingRecord<TValue = any> {
  key: string;
  value: TValue;
  updatedAt: number;
}

// Sync event callback type
type SyncCallback = () => void;
let syncCallbacks: SyncCallback[] = [];

export function onDatabaseChange(callback: SyncCallback): () => void {
  syncCallbacks.push(callback);
  return () => {
    syncCallbacks = syncCallbacks.filter(cb => cb !== callback);
  };
}

function notifyDatabaseChange() {
  syncCallbacks.forEach(cb => cb());
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

    // Add middleware to auto-set updatedAt and trigger sync on changes
    this.use({
      stack: 'dbcore',
      name: 'syncMiddleware',
      create: (downlevelDatabase) => ({
        ...downlevelDatabase,
        table: (tableName) => {
          const downlevelTable = downlevelDatabase.table(tableName);
          return {
            ...downlevelTable,
            mutate: async (req) => {
              // Set updatedAt for creating/updating operations
              if (req.type === 'add' || req.type === 'put') {
                const now = Date.now();
                if (Array.isArray(req.values)) {
                  req.values = req.values.map((val: any) => ({
                    ...val,
                    updatedAt: now
                  }));
                }
              }

              // Execute the mutation
              const result = await downlevelTable.mutate(req);

              // Notify listeners after successful mutation (for sync)
              // Skip logs table to avoid sync loops
              if (tableName !== 'logs' && result.numFailures === 0) {
                // Use setTimeout to avoid blocking the mutation
                setTimeout(() => notifyDatabaseChange(), 0);
              }

              return result;
            }
          };
        }
      })
    });
  }
}

export const db = new SelfDatabase();

// ============ SOFT DELETE HELPERS ============
// These functions mark items as deleted instead of removing them,
// allowing the deletion to sync across devices.

export async function softDeleteGoal(id: number): Promise<void> {
  await db.goals.update(id, {
    isDeleted: true,
    updatedAt: Date.now()
  });
}

export async function softDeleteConstraint(id: number): Promise<void> {
  await db.constraints.update(id, {
    isDeleted: true,
    updatedAt: Date.now()
  });
}

// Helper to get only active (non-deleted) goals
export function getActiveGoals() {
  return db.goals.filter(g => !g.isDeleted).toArray();
}

// Helper to get only active (non-deleted) constraints
export function getActiveConstraints() {
  return db.constraints.filter(c => !c.isDeleted).toArray();
}