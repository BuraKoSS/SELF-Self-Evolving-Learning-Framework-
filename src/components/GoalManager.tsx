'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks'; // Veritabanını dinleyen hook
import { db } from '../db/db';

export default function GoalManager() {
  // --- STATE (Form Verileri) ---
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  // --- READ (Veri Okuma) ---
  // useLiveQuery: Veritabanında değişiklik olduğunda listeyi otomatik günceller.
  const goals = useLiveQuery(() => db.goals.toArray());

  // --- CREATE (Veri Ekleme) ---
  const addGoal = async () => {
    if (!title || !hours) return alert('Lütfen ders adı ve saat giriniz.');
    
    try {
      await db.goals.add({
        title,
        targetHours: Number(hours),
        priority,
        deadline: new Date() // Şimdilik bugünün tarihi, sonra geliştirilebilir
      });
      // Formu temizle
      setTitle('');
      setHours('');
    } catch (error) {
      alert(`Hata: ${error}`);
    }
  };

  // --- DELETE (Veri Silme) ---
  const deleteGoal = async (id: number) => {
    await db.goals.delete(id);
  };

  // --- UPDATE (Basit Güncelleme - Saati Arttırma) ---
  const incrementHours = async (id: number, currentHours: number) => {
    await db.goals.update(id, { targetHours: currentHours + 1 });
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      {/* 1. EKLEME FORMU */}
      <div className="bg-white shadow rounded-lg p-6 mb-8 text-gray-800">
        <h2 className="text-xl font-bold mb-4 text-blue-600">Yeni Hedef / Ders Ekle</h2>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Ders Adı (Örn: Secure Coding)"
            className="border p-2 rounded"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Hedef Saat"
              className="border p-2 rounded w-1/3"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <select 
              className="border p-2 rounded w-1/3"
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
            >
              <option value="low">Düşük Öncelik</option>
              <option value="medium">Orta Öncelik</option>
              <option value="high">Yüksek Öncelik</option>
            </select>
            <button 
              onClick={addGoal}
              className="bg-blue-600 text-white p-2 rounded w-1/3 hover:bg-blue-700 transition"
            >
              + Ekle
            </button>
          </div>
        </div>
      </div>

      {/* 2. LİSTELEME ALANI */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-700">Haftalık Hedef Listesi ({goals?.length || 0})</h2>
        
        {goals?.map((goal) => (
          <div key={goal.id} className="bg-white border-l-4 border-blue-500 shadow-sm p-4 rounded flex justify-between items-center text-gray-800">
            <div>
              <h3 className="font-bold text-lg">{goal.title}</h3>
              <p className="text-sm text-gray-500">
                Hedef: <span className="font-semibold text-blue-600">{goal.targetHours} Saat</span> | 
                Öncelik: <span className="uppercase text-xs font-bold text-gray-400">{goal.priority}</span>
              </p>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => incrementHours(goal.id!, goal.targetHours)}
                className="bg-green-100 text-green-700 px-3 py-1 rounded text-sm hover:bg-green-200"
                title="Saati Arttır (Update Testi)"
              >
                +1 Saat
              </button>
              <button 
                onClick={() => deleteGoal(goal.id!)}
                className="bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200"
                title="Sil (Delete Testi)"
              >
                Sil
              </button>
            </div>
          </div>
        ))}

        {goals?.length === 0 && (
          <p className="text-center text-gray-400 italic">Henüz bir hedef eklenmedi.</p>
        )}
      </div>
    </div>
  );
}