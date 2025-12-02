'use client';
import GoalManager from '../components/GoalManager';
import WeeklyPlanner from '../components/WeeklyPlanner';
import PomodoroPage from './pomodoro/page';

export default function Home() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            <div className="text-center mb-10">
                <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
                    SELF Planner
                </h1>
                <p className="text-gray-600">
                    Week 2: CRUD Operations &amp; Data Layer Demo
                </p>
            </div>

            {/* CRUD ekranı */}
            <GoalManager />
            
             {/* pomodoro zamanlayıcı */}
            <div className="mt-16 border-t pt-10">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">
                    Odaklanma Zamanı!
                </h2>
                <PomodoroPage /> 
            </div>

            {/* Haftalık Plan & Scheduler */}
            <div className="mt-16 border-t pt-10">
                <WeeklyPlanner />
            </div>
        </main>
    );
}
