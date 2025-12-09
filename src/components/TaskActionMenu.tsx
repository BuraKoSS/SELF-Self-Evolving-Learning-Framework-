'use client';
import { useState } from 'react';
import { db } from '../db/db';
import { logEvent } from '../observer/logging';
import { EVENT_TYPES } from '../observer/events';
import { POSTPONE_REASONS, PostponeReason, PostponePayload, CancelPayload } from '../types/analytics';

interface Props {
    goalId: number;
    goalTitle: string;
    currentStatus?: 'active' | 'postponed' | 'completed'; // [YENİ] Mevcut durumu alıyoruz
}

export default function TaskActionMenu({ goalId, goalTitle, currentStatus }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'menu' | 'reasons'>('menu');

    // [YENİ] Askıdan Alma Fonksiyonu
    const handleResume = async () => {
        // Durumu tekrar 'active' yapıyoruz
        await db.goals.update(goalId, { status: 'active' });
        // Log atmak isterseniz (Opsiyonel):
        // await logEvent(EVENT_TYPES.GOAL_UPDATED, { goalId, status: 'active' }, 'TaskActionMenu');
        
        alert(`"${goalTitle}" tekrar aktif edildi.`);
        setIsOpen(false);
    };

    const handlePostpone = async (reasonKey: string) => {
        const payload: PostponePayload = {
            goalId,
            reason: reasonKey as PostponeReason,
        };
        await logEvent(EVENT_TYPES.POSTPONE, payload, 'TaskActionMenu');
        await db.goals.update(goalId, { status: 'postponed' });
        
        setIsOpen(false);
        setMode('menu');
    };

    const handleCancel = async () => {
        if (!confirm(`"${goalTitle}" hedefini tamamen silmek istediğinize emin misiniz?`)) return;

        const payload: CancelPayload = { goalId };
        await logEvent(EVENT_TYPES.CANCEL, payload, 'TaskActionMenu');
        await db.goals.delete(goalId);

        setIsOpen(false);
    };

    return (
        <div className="relative inline-block ml-2 z-50">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-400 hover:text-blue-600 font-bold px-2 py-0.5 text-lg"
            >
                •••
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-1 w-60 bg-white rounded-md shadow-xl border border-gray-200 z-50 overflow-hidden">
                    {mode === 'menu' ? (
                        <div className="flex flex-col">
                            {/* [YENİ] Eğer ertelenmişse 'Askıdan Al' göster, değilse 'Ertele' göster */}
                            {currentStatus === 'postponed' ? (
                                <button 
                                    onClick={handleResume}
                                    className="text-left px-4 py-3 text-sm text-green-700 hover:bg-green-50 border-b border-gray-100 transition font-semibold"
                                >
                                    ▶️ Askıdan Al (Aktif Et)
                                </button>
                            ) : (
                                <button 
                                    onClick={() => setMode('reasons')}
                                    className="text-left px-4 py-3 text-sm text-yellow-700 hover:bg-yellow-50 border-b border-gray-100 transition"
                                >
                                    🕒 Ertele (Askıya Al)
                                </button>
                            )}
                            
                            <button 
                                onClick={handleCancel}
                                className="text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 border-b border-gray-100 transition"
                            >
                                🚫 İptal Et (Sil)
                            </button>
                            <button 
                                onClick={() => setIsOpen(false)} 
                                className="text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-50"
                            >
                                Vazgeç
                            </button>
                        </div>
                    ) : (
                        <div className="bg-yellow-50">
                            <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">NEDEN ERTELİYORSUN?</div>
                            {Object.entries(POSTPONE_REASONS).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => handlePostpone(key)}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-yellow-100 border-b border-yellow-100/50"
                                >
                                    {label}
                                </button>
                            ))}
                            <button 
                                onClick={() => setMode('menu')} 
                                className="block w-full text-left px-4 py-2 text-xs text-gray-500 hover:text-gray-700"
                            >
                                ← Geri Dön
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}