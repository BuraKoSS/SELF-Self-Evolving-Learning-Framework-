import Dexie, { Table } from 'dexie';

// --- 1. ARAYÜZLER (Interfaces) ---
// Proje dokümanındaki "Core Domain" varlıklarına uygun veri tipleri

export interface Goal {
  id?: number;
  title: string;       // Ders adı (Örn: "Biçimsel Diller")
  targetHours: number; // Haftalık hedef (Örn: 5 saat)
  deadline?: Date;     // Sınav tarihi
  priority: 'low' | 'medium' | 'high';
}

export interface Session {
  id?: number;
  goalId: number;      // Hangi derse ait olduğu
  startTime: Date;
  duration: number;    // Dakika cinsinden çalışma süresi
  status: 'completed' | 'interrupted';
}

// --- 2. VERİTABANI SINIFI ---
// Dokümandaki "Offline-first using IndexedDB" gereksinimi için yapı

export class SelfDatabase extends Dexie {
  // Tablolarımız
  goals!: Table<Goal>;
  sessions!: Table<Session>; 

  constructor() {
    super('SelfDatabase'); // Tarayıcıda görünecek veritabanı adı
    
    // Şema Tanımı (Schema)
    // Sadece arama yapacağımız alanları buraya yazıyoruz.
    this.version(1).stores({
      goals: '++id, title, deadline, priority', // ++id: otomatik artan numara
      sessions: '++id, goalId, startTime' 
    });
  }
}

// Veritabanını dışa aktar
export const db = new SelfDatabase();