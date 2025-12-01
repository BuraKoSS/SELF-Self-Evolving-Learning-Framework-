'use client';
import { useEffect, useState } from 'react';
import { db } from '../db/db'; // Oluşturduğumuz db dosyasını çağırıyoruz

export default function Home() {
  const [status, setStatus] = useState('Veritabanı bekleniyor...');

  useEffect(() => {
    const initDb = async () => {
      try {
        // Veritabanına test verisi ekle
        // Bu işlem "Goal" (Ders) ekleme simülasyonudur
        const count = await db.goals.count();
        if (count === 0) {
          await db.goals.add({
            title: 'CENG472 Secure Coding',
            targetHours: 5,
            priority: 'high',
            deadline: new Date('2025-01-20')
          });
          setStatus('Veritabanı oluşturuldu ve ilk ders eklendi!');
        } else {
          setStatus('Veritabanı hazır ve çalışıyor.');
        }
      } catch (error) {
        setStatus('Hata oluştu: ' + error);
      }
    };

    initDb();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">SELF Project - Week 1</h1>
      <div className="p-4 border rounded bg-gray-100 dark:bg-gray-800">
        <p className="text-lg">Durum: <span className="font-mono text-blue-500">{status}</span></p>
      </div>
    </main>
  );
}