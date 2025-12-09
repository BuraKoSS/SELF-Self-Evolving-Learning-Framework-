"use client";
import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { logEvent } from "../observer/logging";
import { EVENT_TYPES } from "../observer/events";

export default function PomodoroTimer() {
    const WORK_TIME = 30 * 60; // [GÜNCELLEME] 30 Dakika
    const BREAK_TIME = 5 * 60;

    const [timeLeft, setTimeLeft] = useState(WORK_TIME);
    const [isRunning, setIsRunning] = useState(false);
    const [mode, setMode] = useState("work"); 
    
    const [selectedGoalId, setSelectedGoalId] = useState("");
    const goals = useLiveQuery(() => db.goals.toArray());

    useEffect(() => {
        let interval = null;
        if (isRunning && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isRunning, timeLeft]);

    useEffect(() => {
        if (timeLeft === 0 && isRunning) {
            handleComplete();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, isRunning]); 

    const handleComplete = async () => {
        setIsRunning(false);

        if (mode === "work") {
            if (selectedGoalId) {
                try {
                    const goalIdNum = Number(selectedGoalId);
                    await logEvent(EVENT_TYPES.FOCUS, {
                        goalId: goalIdNum,
                        durationMinutes: 30, // 30 dk loglanıyor
                        completedAt: new Date()
                    }, 'PomodoroTimer');

                    await db.sessions.add({
                        goalId: goalIdNum,
                        startTime: new Date(),
                        duration: 30, 
                        status: 'completed'
                    });
                    
                    alert("Oturum tamamlandı! (30 dk)");
                } catch (error) {
                    console.error("Kayıt hatası:", error);
                }
            }
            setMode("break");
            setTimeLeft(BREAK_TIME);
        } else {
            setMode("work");
            setTimeLeft(WORK_TIME);
            alert("Mola bitti!");
        }
    };

    const toggleTimer = () => {
        if (mode === 'work' && !selectedGoalId) {
            alert("Lütfen önce çalışılacak bir ders seçin!");
            return;
        }
        setIsRunning(!isRunning);
    };

    const resetTimer = () => {
        setIsRunning(false);
        setMode("work");
        setTimeLeft(WORK_TIME);
    };

    // [YENİ] Test Butonu Fonksiyonu
    const forceFinish = () => {
        if (mode === 'work' && !selectedGoalId) {
            alert("Ders seçin, sonra bitirin.");
            return;
        }
        // Sayacı 1 saniyeye indir, useEffect yakalasın
        setIsRunning(true);
        setTimeLeft(0); 
    };

    const format = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border text-center max-w-md mx-auto mb-8 transition-colors duration-300" 
             style={{ borderColor: isRunning ? (mode === 'work' ? '#f97316' : '#22c55e') : '#e5e7eb' }}>
            
            <h2 className="text-2xl font-bold mb-4 text-gray-800">
                {mode === "work" ? "🔥 Çalışma Modu (30dk)" : "☕ Mola Modu"}
            </h2>

            {mode === "work" && (
                <div className="mb-4">
                    <select 
                        className="w-full p-2 border rounded bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedGoalId}
                        onChange={(e) => setSelectedGoalId(e.target.value)}
                        disabled={isRunning}
                    >
                        <option value="">-- Ders Seçin --</option>
                        {goals?.map((g) => (
                            <option key={g.id} value={g.id}>{g.title}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className={`text-6xl font-mono font-bold mb-6 ${mode === 'work' ? 'text-blue-600' : 'text-green-600'}`}>
                {format(timeLeft)}
            </div>

            <div className="flex gap-2 justify-center flex-wrap">
                <button 
                    onClick={toggleTimer}
                    className={`px-6 py-2 rounded-full text-white font-bold shadow-md ${
                        isRunning ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {isRunning ? "Duraklat" : "Başlat"}
                </button>

                <button 
                    onClick={resetTimer}
                    className="px-6 py-2 rounded-full bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300"
                >
                    Sıfırla
                </button>

                {/* [YENİ] Test Butonu */}
                <button 
                    onClick={forceFinish}
                    className="px-4 py-2 rounded-full bg-purple-100 text-purple-700 font-bold text-xs hover:bg-purple-200 border border-purple-300"
                    title="Geliştirici Test Butonu"
                >
                    🚀 HIZLI BİTİR
                </button>
            </div>
        </div>
    );
}