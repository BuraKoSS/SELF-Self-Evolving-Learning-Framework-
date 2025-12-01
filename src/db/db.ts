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

export class SelfDatabase extends Dexie {
  goals!: Table<Goal>;
  constraints!: Table<Constraint>; // Yeni tablo

  constructor() {
    super('SelfDatabase');
    // Versiyonu 2'ye çektik ki tarayıcı veritabanını güncellesin
    this.version(2).stores({
      goals: '++id, title, deadline, priority',
      constraints: '++id, type' // Yeni indeks
    });
  }
}

export const db = new SelfDatabase();