'use client';

import { useState, useEffect, useCallback } from 'react';
import { SyncAgent, KnownPeerInfo } from '../lib/sync/SyncAgent';

export default function PeerConnectionPanel() {
    const [deviceId, setDeviceId] = useState<string>('');
    const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
    const [knownPeers, setKnownPeers] = useState<KnownPeerInfo[]>([]);
    const [peerIdInput, setPeerIdInput] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string>('');
    const [isInitialized, setIsInitialized] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const syncAgent = SyncAgent.getInstance();

    const refreshState = useCallback(() => {
        setDeviceId(syncAgent.getDeviceId());
        setConnectedPeers(syncAgent.getConnectedPeers());
        setKnownPeers(syncAgent.getKnownPeers());
    }, [syncAgent]);

    useEffect(() => {
        const init = async () => {
            try {
                await syncAgent.initialize();
                setIsInitialized(true);
                refreshState();
            } catch (err) {
                console.error('Failed to initialize SyncAgent:', err);
                setError('Bağlantı başlatılamadı');
            }
        };

        init();

        // Subscribe to connection events
        const unsubscribe = syncAgent.onConnectionChange((event) => {
            refreshState();

            if (event.type === 'error' && event.error) {
                setError(event.error.message);
                setTimeout(() => setError(''), 3000);
            }
        });

        return () => unsubscribe();
    }, [syncAgent, refreshState]);

    const handleConnect = async () => {
        if (!peerIdInput.trim()) return;

        setIsConnecting(true);
        setError('');

        try {
            await syncAgent.connectToPeer(peerIdInput.trim());
            setPeerIdInput('');
        } catch (err: any) {
            setError(err.message || 'Bağlantı başarısız');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = (peerId: string) => {
        syncAgent.disconnectFromPeer(peerId);
    };

    const handleDisconnectAll = () => {
        syncAgent.disconnectAll();
    };

    const handleReconnect = async (peerId: string) => {
        setIsConnecting(true);
        try {
            await syncAgent.connectToPeer(peerId);
        } catch (err: any) {
            setError(err.message || 'Yeniden bağlanamadı');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleRemoveKnown = (peerId: string) => {
        syncAgent.removeKnownPeer(peerId);
        refreshState();
    };

    const copyDeviceId = async () => {
        try {
            await navigator.clipboard.writeText(deviceId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = deviceId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const offlinePeers = knownPeers.filter(p =>
        p.peerId !== deviceId && !connectedPeers.includes(p.peerId)
    );

    if (!isInitialized) {
        return (
            <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
                <div className="flex items-center gap-2 text-zinc-400">
                    <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Bağlantı başlatılıyor...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 overflow-hidden">
            {/* Header - Always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-zinc-700/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">📱</span>
                    <span className="font-semibold text-white">Cihaz Senkronizasyonu</span>
                    {connectedPeers.length > 0 && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">
                            {connectedPeers.length} bağlı
                        </span>
                    )}
                </div>
                <svg
                    className={`w-5 h-5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expandable Content */}
            {isExpanded && (
                <div className="p-4 pt-0 space-y-4">
                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    {/* Device ID */}
                    <div className="bg-zinc-900/50 rounded-lg p-3">
                        <label className="text-xs text-zinc-500 block mb-1">Cihaz ID</label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm text-emerald-400 font-mono bg-black/30 px-2 py-1 rounded truncate">
                                {deviceId}
                            </code>
                            <button
                                onClick={copyDeviceId}
                                className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                                title="Kopyala"
                            >
                                {copied ? (
                                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Connect to New Device */}
                    <div>
                        <label className="text-xs text-zinc-500 block mb-2">Yeni Cihaz Bağla</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={peerIdInput}
                                onChange={(e) => setPeerIdInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                                placeholder="Cihaz ID girin..."
                                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                            />
                            <button
                                onClick={handleConnect}
                                disabled={isConnecting || !peerIdInput.trim()}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {isConnecting ? 'Bağlanıyor...' : 'Bağlan'}
                            </button>
                        </div>
                    </div>

                    {/* Connected Peers */}
                    {connectedPeers.length > 0 && (
                        <div>
                            <label className="text-xs text-zinc-500 block mb-2">
                                Bağlı Cihazlar ({connectedPeers.length})
                            </label>
                            <div className="space-y-2">
                                {connectedPeers.map((peerId) => (
                                    <div
                                        key={peerId}
                                        className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                                            <code className="text-sm text-zinc-300 font-mono truncate max-w-[180px]">
                                                {peerId}
                                            </code>
                                        </div>
                                        <button
                                            onClick={() => handleDisconnect(peerId)}
                                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                                        >
                                            Bağlantıyı Kes
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Offline Known Peers */}
                    {offlinePeers.length > 0 && (
                        <div>
                            <label className="text-xs text-zinc-500 block mb-2">
                                Bilinen Cihazlar (çevrimdışı) ({offlinePeers.length})
                            </label>
                            <div className="space-y-2">
                                {offlinePeers.map((peer) => (
                                    <div
                                        key={peer.peerId}
                                        className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 bg-zinc-500 rounded-full" />
                                            <code className="text-sm text-zinc-500 font-mono truncate max-w-[140px]">
                                                {peer.peerId}
                                            </code>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleReconnect(peer.peerId)}
                                                disabled={isConnecting}
                                                className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                            >
                                                Bağlan
                                            </button>
                                            <button
                                                onClick={() => handleRemoveKnown(peer.peerId)}
                                                className="text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
                                            >
                                                Sil
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Disconnect All Button */}
                    {connectedPeers.length > 0 && (
                        <button
                            onClick={handleDisconnectAll}
                            className="w-full py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20"
                        >
                            Tüm Bağlantıları Kes
                        </button>
                    )}

                    {/* Manual Sync Button */}
                    {connectedPeers.length > 0 && (
                        <button
                            onClick={() => syncAgent.sync()}
                            className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors border border-blue-500/20 flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Manuel Senkronizasyon
                        </button>
                    )}

                    {/* Empty State */}
                    {connectedPeers.length === 0 && offlinePeers.length === 0 && (
                        <div className="text-center py-4 text-zinc-500 text-sm">
                            Henüz bağlı cihaz yok. Başka bir cihazdaki ID'yi girerek bağlanın.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
