'use client';
import GoalManager from '../components/GoalManager';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2">SELF Planner</h1>
        <p className="text-gray-600">Week 2: CRUD Operations & Data Layer Demo</p>
      </div>
      
      {/* Yönetim Bileşenini Çağırıyoruz */}
      <GoalManager />
    </main>
  );
}