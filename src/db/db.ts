import Dexie, { Table } from 'dexie';

// 1. ARAYÜZLER (INTERFACES)
// Dokümandaki "Entities: Goal, Plan, Session" yapısına uygun veri tipleri 

export interface Goal {
  id?: number;
  title: string;       // Ders adı veya Hedef (Örn: "CENG472 Secure Coding")
  targetHours: number; // Haftalık hedeflenen çalışma saati [cite: 18]
  deadline?: Date;     // Sınav veya proje teslim tarihi [cite: 18]
  priority: 'low' | 'medium' | 'high'; // Öncelik seviyesi
}

export interface Constraint {
  id?: number;
  type: 'busy_hours' | 'max_daily_load' | 'day_off'; // Kısıt türü
  value: string | number; // Örn: "Sunday" veya "4 hours"
  description: string;    // Kullanıcı için açıklama
}

export interface Session {
  id?: number;
  goalId: number;      // Hangi derse çalışıldığı
  startTime: Date;
  duration: number;    // Dakika cinsinden süre (Pomodoro verisi için)
  status: 'completed' | 'interrupted';
}

// 2. VERİTABANI SINIFI
// IndexedDB'yi yöneten ana sınıfımız

export class SelfDatabase extends Dexie {
  // Tablo tanımları
  goals!: Table<Goal>;
  constraints!: Table<Constraint>;
  sessions!: Table<Session>; 

  constructor() {
    super('SelfDatabase'); // Veritabanı adı
    
    // Şema Tanımı (Schema Definition)
    // Sadece indekslenecek (aramada kullanılacak) alanları buraya yazıyoruz.
    this.version(1).stores({
      goals: '++id, title, deadline, priority', // id otomatik artar (++id)
      constraints: '++id, type',
      sessions: '++id, goalId, startTime, status' 
    });
  }
}

// Veritabanı örneğini dışa aktar
export const db = new SelfDatabase();