'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export default function GoalManager() {
  // --- STATE: HEDEFLER (GOALS) ---
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  // --- STATE: KISITLAR (CONSTRAINTS) ---
  const [consTitle, setConsTitle] = useState(''); // Örn: "Salı Spor"
  const [consHours, setConsHours] = useState(''); // Örn: "2" saat

  // --- READ: VERİTABANINDAN CANLI ÇEKME ---
  // useLiveQuery sayesinde veritabanı değiştiği an bu listeler otomatik güncellenir.
  const goals = useLiveQuery(() => db.goals.toArray());
  // Dikkat: db.constraints'in çalışması için db.ts dosyanızı güncellemiş olmanız gerekir.
  const constraints = useLiveQuery(() => db.constraints?.toArray() ?? []); 

  // --- CREATE: HEDEF EKLEME ---
  const addGoal = async () => {
    if (!title || !hours) return alert('Lütfen ders adı ve saat giriniz.');
    
    try {
      await db.goals.add({
        title,
        targetHours: Number(hours),
        priority,
        deadline: new Date() // Varsayılan olarak bugünün tarihi
      });
      setTitle(''); 
      setHours('');
    } catch (error) {
      console.error("Hedef eklenirken hata:", error);
    }
  };

  // --- CREATE: KISIT EKLEME ---
  const addConstraint = async () => {
    if (!consTitle || !consHours) return alert('Lütfen kısıt adı ve süre giriniz.');

    try {
      // db.constraints tablosuna yazıyoruz
      if (db.constraints) {
        await db.constraints.add({
          title: consTitle,
          type: 'busy', // Varsayılan tip: meşgul
          duration: Number(consHours)
        });
        setConsTitle(''); 
        setConsHours('');
      } else {
        alert("Veritabanı şeması güncel değil. Lütfen db.ts dosyasını kontrol edin.");
      }
    } catch (error) {
      console.error("Kısıt eklenirken hata:", error);
    }
  };

  // --- DELETE: SİLME İŞLEMLERİ ---
  const deleteGoal = async (id: number) => {
    await db.goals.delete(id);
  };

  const deleteConstraint = async (id: number) => {
    if (db.constraints) {
      await db.constraints.delete(id);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* --- SOL PANEL: DERS HEDEFLERİ --- */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-700">Ders Hedefleri</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
              Toplam: {goals?.length || 0}
            </span>
          </div>
          
          {/* Ekleme Formu */}
          <div className="bg-white p-5 shadow-lg rounded-xl border border-blue-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ders / Konu Adı</label>
            <input 
              className="border border-gray-300 p-2 rounded w-full mb-3 focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="Örn: CENG472 Secure Coding" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
            />
            
            <div className="flex gap-3">
              <div className="w-1/3">
                <input 
                  className="border border-gray-300 p-2 rounded w-full" 
                  type="number" 
                  placeholder="Saat" 
                  value={hours} 
                  onChange={e => setHours(e.target.value)} 
                />
              </div>
              <div className="w-1/3">
                <select 
                  className="border border-gray-300 p-2 rounded w-full bg-white" 
                  value={priority} 
                  onChange={e => setPriority(e.target.value as any)}
                >
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                  <option value="low">Düşük</option>
                </select>
              </div>
              <button 
                onClick={addGoal} 
                className="w-1/3 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
              >
                + Ekle
              </button>
            </div>
          </div>

          {/* Liste */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {goals?.map(g => (
              <div key={g.id} className="group bg-white p-4 shadow-sm rounded-lg border-l-4 border-blue-500 flex justify-between items-center hover:shadow-md transition">
                <div>
                  <div className="font-bold text-gray-800 text-lg">{g.title}</div>
                  <div className="text-xs text-gray-500 mt-1 flex gap-2">
                    <span className="bg-gray-100 px-2 py-0.5 rounded">Hedef: {g.targetHours}s</span>
                    <span className={`px-2 py-0.5 rounded uppercase ${g.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {g.priority}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => deleteGoal(g.id!)} 
                  className="text-gray-400 hover:text-red-500 transition px-2 py-1"
                  title="Sil"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
            {goals?.length === 0 && <p className="text-gray-400 text-center italic mt-4">Henüz bir ders eklenmedi.</p>}
          </div>
        </div>

        {/* --- SAĞ PANEL: ZAMAN KISITLARI --- */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-orange-600">Zaman Kısıtları</h2>
            <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-2.5 py-0.5 rounded">
              Toplam: {constraints?.length || 0}
            </span>
          </div>

          {/* Ekleme Formu */}
          <div className="bg-white p-5 shadow-lg rounded-xl border border-orange-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kısıt Tanımı</label>
            <input 
              className="border border-gray-300 p-2 rounded w-full mb-3 focus:ring-2 focus:ring-orange-500 outline-none" 
              placeholder="Örn: Salı Basketbol Antrenmanı" 
              value={consTitle} 
              onChange={e => setConsTitle(e.target.value)} 
            />
            
            <div className="flex gap-3">
              <div className="w-2/3">
                <input 
                  className="border border-gray-300 p-2 rounded w-full" 
                  type="number" 
                  placeholder="Süre (Saat)" 
                  value={consHours} 
                  onChange={e => setConsHours(e.target.value)} 
                />
              </div>
              <button 
                onClick={addConstraint} 
                className="w-1/3 bg-orange-600 text-white font-medium rounded hover:bg-orange-700 transition"
              >
                Ekle
              </button>
            </div>
          </div>

          {/* Liste */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {constraints?.map(c => (
              <div key={c.id} className="group bg-white p-4 shadow-sm rounded-lg border-l-4 border-orange-500 flex justify-between items-center hover:shadow-md transition">
                <div>
                  <div className="font-bold text-gray-800 text-lg">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded border border-orange-100">
                      {c.duration} Saat Blokeli
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => deleteConstraint(c.id!)} 
                  className="text-gray-400 hover:text-red-500 transition px-2 py-1"
                  title="Sil"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            ))}
            {constraints?.length === 0 && <p className="text-gray-400 text-center italic mt-4">Henüz bir kısıt eklenmedi.</p>}
          </div>
        </div>

      </div>
    </div>
  );
}