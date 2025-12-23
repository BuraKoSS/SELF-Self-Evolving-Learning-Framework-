'use client';

import { useEffect, useState } from 'react';

export default function ConnectionStatusBanner() {
    const [online, setOnline] = useState(
        typeof window !== 'undefined' ? navigator.onLine : true
    );
    const [justCameOnline, setJustCameOnline] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleOnline = () => {
            setOnline(true);
            setJustCameOnline(true);
            setTimeout(() => setJustCameOnline(false), 3000);
        };

        const handleOffline = () => {
            setOnline(false);
            setJustCameOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (online && !justCameOnline) return null;

    const isOffline = !online;

    return (
        <div
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-xs font-medium
      ${isOffline ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}
        >
            {isOffline
                ? 'Offline mode – changes will sync when you are back online.'
                : 'Back online – your data is up to date.'}
        </div>
    );
}
