'use client';

import dynamic from 'next/dynamic';
import ServiceWorkerManager from '../components/ServiceWorkerManager';
import ConnectionStatusBanner from '../components/ConnectionStatusBanner';

// Heavy components are loaded dynamically to improve initial load
const GoalManager = dynamic(() => import('../components/GoalManager'), {
    ssr: false,
});
const WeeklyPlanner = dynamic(
    () => import('../components/WeeklyPlanner'),
    { ssr: false }
);
const PomodoroPage = dynamic(() => import('./pomodoro/page'), {
    ssr: false,
});
const LogPanel = dynamic(() => import('../components/LogPanel'), {
    ssr: false,
});
const AnalyticsDashboard = dynamic(
    () => import('../components/AnalyticsDashboard'),
    { ssr: false }
);

export default function Home() {
    return (
        <main className="min-h-screen bg-gray-50 py-10">
            {/* Service Worker registration + Online/Offline UI feedback */}
            <ServiceWorkerManager />
            <ConnectionStatusBanner />

            <div className="text-center mb-10">
                <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
                    SELF Planner
                </h1>
            </div>

            {/* CRUD ekranı */}
            <GoalManager />

            {/* Pomodoro zamanlayıcı */}
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

            {/* Analytics Dashboard */}
            <div className="mt-16 border-t pt-10">
                <AnalyticsDashboard />
            </div>

            {/* Observer Logs (temporary dev panel) */}
            <LogPanel />
        </main>
    );
}
