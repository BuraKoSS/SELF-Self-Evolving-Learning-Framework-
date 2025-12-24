'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDeleteConstraint } from '../db/db';
import TaskActionMenu from './TaskActionMenu';

export default function GoalManager() {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const [consTitle, setConsTitle] = useState('');
  const [consHours, setConsHours] = useState('');
  // consDay state'ini kaldırdık çünkü formdan sildik.

  // SORGULAR
  const goalsWithProgress = useLiveQuery(async () => {
    const goals = await db.goals.filter(g => !g.isDeleted).toArray();
    const sessions = await db.sessions.toArray();

    return goals.map(g => {
      const totalMinutes = sessions
        .filter((s: any) => s.goalId === g.id && s.status === 'completed')
        .reduce((acc: number, s: any) => acc + s.duration, 0);

      return {
        ...g,
        completedHours: (totalMinutes / 60).toFixed(1)
      };
    });
  });

  const constraints = useLiveQuery(() => db.constraints?.filter(c => !c.isDeleted).toArray() ?? []);

  // --- ACTIONS ---
  const addGoal = async () => {
    if (!title || !hours) return alert('Lütfen ders adı ve saat giriniz.');
    await db.goals.add({
      title,
      targetHours: Number(hours),
      priority,
      deadline: new Date(),
      status: 'active'
    });
    setTitle(''); setHours('');
  };

  const addConstraint = async () => {
    if (!consTitle || !consHours) return alert('Lütfen kısıt adı ve süre giriniz.');
    if (db.constraints) {
      await db.constraints.add({
        title: consTitle,
        type: 'busy',
        duration: Number(consHours),
        day: 'Genel' // Varsayılan değer, çünkü seçim kaldırıldı
      });
      setConsTitle(''); setConsHours('');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* --- DERS HEDEFLERİ (SOL) --- */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-blue-700">Ders Hedefleri</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
              {goalsWithProgress?.length || 0} Ders
            </span>
          </div>

          <div className="bg-white p-5 shadow-lg rounded-xl border border-blue-100">
            <input className="border border-gray-300 p-2 rounded w-full mb-3 text-gray-900" placeholder="Örn: CENG472 Secure Coding" value={title} onChange={e => setTitle(e.target.value)} />
            <div className="flex gap-3">
              <input className="border border-gray-300 p-2 rounded w-1/3 text-gray-900" type="number" placeholder="Saat" value={hours} onChange={e => setHours(e.target.value)} />
              <select className="border border-gray-300 p-2 rounded w-1/3 bg-white text-gray-900" value={priority} onChange={e => setPriority(e.target.value as any)}>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
                <option value="low">Düşük</option>
              </select>
              <button onClick={addGoal} className="w-1/3 bg-blue-600 text-white rounded hover:bg-blue-700">+ Ekle</button>
            </div>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 pb-20">
            {goalsWithProgress?.map(g => (
              <div
                key={g.id}
                className={`bg-white p-4 shadow-sm rounded-lg border-l-4 relative group z-0 hover:z-10 transition-all
                    ${g.status === 'postponed' ? 'border-gray-300 bg-gray-50' : 'border-blue-500'} 
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-lg ${g.status === 'postponed' ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                          {g.title}
                        </span>
                        {g.status === 'postponed' && (
                          <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-200">
                            ASKIDA
                          </span>
                        )}
                      </div>

                      {/* MENU: status prop'u eklendi */}
                      <TaskActionMenu
                        goalId={g.id!}
                        goalTitle={g.title}
                        currentStatus={g.status}
                      />
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold text-blue-700">{g.completedHours}</span> / {g.targetHours} Saat
                    </div>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${g.status === 'postponed' ? 'bg-gray-400' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min(100, (Number(g.completedHours) / g.targetHours) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* --- ZAMAN KISITLARI (SAĞ) --- */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-orange-600">Zaman Kısıtları</h2>

          {/* Form ESKİ HALİNE döndü (Gün seçimi kalktı) */}
          <div className="bg-white p-5 shadow-lg rounded-xl border border-orange-100">
            <input className="border border-gray-300 p-2 rounded w-full mb-3 text-gray-900" placeholder="Örn: Basketbol Antrenmanı" value={consTitle} onChange={e => setConsTitle(e.target.value)} />
            <div className="flex gap-3">
              <input className="border border-gray-300 p-2 rounded w-2/3 text-gray-900" type="number" placeholder="Süre (Saat)" value={consHours} onChange={e => setConsHours(e.target.value)} />
              <button onClick={addConstraint} className="w-1/3 bg-orange-600 text-white rounded hover:bg-orange-700">Ekle</button>
            </div>
          </div>

          <div className="space-y-3">
            {constraints?.map(c => (
              <div key={c.id} className="bg-white p-4 shadow-sm rounded-lg border-l-4 border-orange-500 flex justify-between items-center group">
                <div>
                  <div className="font-bold text-gray-800 text-lg">{c.title}</div>
                  <div className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 mt-1 inline-block">
                    {c.duration} Saat Blokeli
                  </div>
                </div>
                <button
                  onClick={() => softDeleteConstraint(c.id!)}
                  className="text-gray-300 hover:text-red-500 transition p-2"
                  title="Sil"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {constraints?.length === 0 && <p className="text-gray-400 italic">Henüz kısıt yok.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}