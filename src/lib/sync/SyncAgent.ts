'use client';

import { db, Goal, Constraint, SettingRecord, onDatabaseChange } from '../../db/db';
import { ConflictResolver } from './ConflictResolver';
import { EncryptionManager } from '../security/Encryption';
import Peer, { DataConnection } from 'peerjs';

// Event types for connection state changes
type ConnectionEvent = {
    type: 'connected' | 'disconnected' | 'data' | 'error' | 'open';
    peerId?: string;
    data?: any;
    error?: Error;
};

type ConnectionCallback = (event: ConnectionEvent) => void;

export interface ConnectedPeer {
    peerId: string;
    connection: DataConnection;
    isConnected: boolean;
}

export interface KnownPeerInfo {
    peerId: string;
    lastSeen: number;
    alias?: string;
}

export class SyncAgent {
    private static instance: SyncAgent | null = null;
    private peer: Peer | null = null;
    private connections: Map<string, DataConnection> = new Map();
    private deviceId: string = '';
    private isSyncing: boolean = false;
    private encryptionKey: CryptoKey | null = null;
    private callbacks: Set<ConnectionCallback> = new Set();
    private isInitialized: boolean = false;
    private initPromise: Promise<void> | null = null;
    private dbChangeUnsubscribe: (() => void) | null = null;
    private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private isReceivingSync: boolean = false; // Flag to prevent sync loops

    private constructor() { }

    static getInstance(): SyncAgent {
        if (!SyncAgent.instance) {
            SyncAgent.instance = new SyncAgent();
        }
        return SyncAgent.instance;
    }

    /**
     * Generate or retrieve persistent device ID
     */
    private getOrCreateDeviceId(): string {
        if (typeof window === 'undefined') return 'server-side';

        const storageKey = 'self-device-id';
        let deviceId = localStorage.getItem(storageKey);

        if (!deviceId) {
            // Generate a unique device ID
            deviceId = `self-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem(storageKey, deviceId);
        }

        return deviceId;
    }

    /**
     * Get known peers from localStorage
     */
    getKnownPeers(): KnownPeerInfo[] {
        if (typeof window === 'undefined') return [];

        const storedPeers = localStorage.getItem('self-known-peers');
        if (!storedPeers) return [];

        try {
            return JSON.parse(storedPeers);
        } catch {
            return [];
        }
    }

    /**
     * Save a peer to known peers list
     */
    private saveKnownPeer(peerId: string): void {
        if (typeof window === 'undefined') return;

        const peers = this.getKnownPeers();
        const existingIndex = peers.findIndex(p => p.peerId === peerId);

        if (existingIndex >= 0) {
            peers[existingIndex].lastSeen = Date.now();
        } else {
            peers.push({ peerId, lastSeen: Date.now() });
        }

        localStorage.setItem('self-known-peers', JSON.stringify(peers));
    }

    /**
     * Remove a peer from known peers list
     */
    removeKnownPeer(peerId: string): void {
        if (typeof window === 'undefined') return;

        const peers = this.getKnownPeers().filter(p => p.peerId !== peerId);
        localStorage.setItem('self-known-peers', JSON.stringify(peers));
    }

    /**
     * Initialize the SyncAgent and connect to PeerJS server
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined') {
                resolve();
                return;
            }

            this.deviceId = this.getOrCreateDeviceId();

            try {
                // Initialize PeerJS with our device ID
                // Use the device ID as peer ID (PeerJS ID = device ID for consistency)
                this.peer = new Peer(this.deviceId, {
                    debug: 1 // 0: none, 1: errors, 2: warnings, 3: all
                });

                this.peer.on('open', (id) => {
                    console.log('[SyncAgent] Connected to signaling server with ID:', id);
                    this.isInitialized = true;
                    this.emit({ type: 'open', peerId: id });

                    // Auto-reconnect to known peers
                    this.autoReconnectKnownPeers();

                    // Subscribe to database changes for auto-sync
                    this.subscribeToDbChanges();

                    resolve();
                });

                this.peer.on('connection', (conn) => {
                    console.log('[SyncAgent] Incoming connection from:', conn.peer);
                    this.handleConnection(conn);
                });

                this.peer.on('error', (err) => {
                    console.error('[SyncAgent] Peer error:', err);
                    this.emit({ type: 'error', error: err });

                    // If ID is already taken (another tab/window is using it), 
                    // keep the same device ID but reject this initialization
                    // The user should close other tabs or wait
                    if (err.type === 'unavailable-id') {
                        console.warn('[SyncAgent] Device ID already in use. Close other tabs using this app or wait.');
                        // Do NOT change the device ID - it must remain consistent
                        reject(new Error('Bu cihaz ID başka bir sekmede kullanılıyor. Diğer sekmeleri kapatın.'));
                    }
                });

                this.peer.on('disconnected', () => {
                    console.log('[SyncAgent] Disconnected from signaling server');
                    // Try to reconnect
                    if (this.peer && !this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                });

            } catch (err) {
                console.error('[SyncAgent] Failed to initialize:', err);
                reject(err);
            }
        });

        return this.initPromise;
    }

    /**
     * Subscribe to database changes for automatic sync
     */
    private subscribeToDbChanges(): void {
        // Unsubscribe from previous subscription if exists
        if (this.dbChangeUnsubscribe) {
            this.dbChangeUnsubscribe();
        }

        this.dbChangeUnsubscribe = onDatabaseChange(() => {
            // Don't sync if we're currently receiving sync data (prevents loops)
            if (this.isReceivingSync) {
                console.log('[SyncAgent] Skipping auto-sync - receiving data');
                return;
            }

            // Debounce sync calls (wait 300ms after last change)
            if (this.syncDebounceTimer) {
                clearTimeout(this.syncDebounceTimer);
            }

            this.syncDebounceTimer = setTimeout(() => {
                console.log('[SyncAgent] Auto-syncing due to database change...');
                this.sync();
            }, 300);
        });

        console.log('[SyncAgent] Subscribed to database changes for auto-sync');
    }

    /**
     * Auto-reconnect to previously known peers
     */
    private async autoReconnectKnownPeers(): Promise<void> {
        const knownPeers = this.getKnownPeers();

        for (const peerInfo of knownPeers) {
            // Don't connect to self
            if (peerInfo.peerId === this.deviceId) continue;

            // Skip if already connected
            if (this.connections.has(peerInfo.peerId)) continue;

            console.log('[SyncAgent] Auto-reconnecting to known peer:', peerInfo.peerId);

            try {
                await this.connectToPeer(peerInfo.peerId);
            } catch (err) {
                console.log('[SyncAgent] Failed to auto-reconnect to:', peerInfo.peerId);
            }
        }
    }

    /**
     * Handle an incoming connection
     */
    private handleConnection(conn: DataConnection): void {
        // Helper function to setup the connection after it's open
        const setupConnection = () => {
            console.log('[SyncAgent] Connection ready with:', conn.peer);
            this.connections.set(conn.peer, conn);
            this.saveKnownPeer(conn.peer);
            this.emit({ type: 'connected', peerId: conn.peer });

            // Trigger sync to this specific peer when connection opens
            // Use small delay to ensure connection is fully stable on both ends
            setTimeout(() => {
                console.log('[SyncAgent] Sending initial sync to:', conn.peer);
                this.sendSyncTo(conn.peer, false);
            }, 100);
        };

        // For INCOMING connections, the connection might already be open
        // Check if it's already open, otherwise wait for 'open' event
        if (conn.open) {
            setupConnection();
        } else {
            conn.on('open', setupConnection);
        }

        conn.on('data', async (data: unknown) => {
            console.log('[SyncAgent] Received data from:', conn.peer);
            await this.handleMessage(data as string, conn.peer);
        });

        conn.on('close', () => {
            console.log('[SyncAgent] Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
            this.emit({ type: 'disconnected', peerId: conn.peer });
        });

        conn.on('error', (err) => {
            console.error('[SyncAgent] Connection error with:', conn.peer, err);
            this.emit({ type: 'error', peerId: conn.peer, error: err });
        });
    }

    /**
     * Connect to a peer by their ID
     */
    async connectToPeer(peerId: string): Promise<void> {
        if (!this.peer) {
            await this.initialize();
        }

        if (this.connections.has(peerId)) {
            console.log('[SyncAgent] Already connected to:', peerId);
            return;
        }

        if (peerId === this.deviceId) {
            console.log('[SyncAgent] Cannot connect to self');
            return;
        }

        return new Promise((resolve, reject) => {
            const conn = this.peer!.connect(peerId, {
                reliable: true
            });

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);

            conn.on('open', () => {
                clearTimeout(timeout);
                this.handleConnection(conn);
                resolve();
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /**
     * Disconnect from a specific peer
     */
    disconnectFromPeer(peerId: string): void {
        const conn = this.connections.get(peerId);
        if (conn) {
            conn.close();
            this.connections.delete(peerId);
            this.emit({ type: 'disconnected', peerId });
        }
    }

    /**
     * Disconnect from all peers
     */
    disconnectAll(): void {
        this.connections.forEach((conn, peerId) => {
            conn.close();
            this.emit({ type: 'disconnected', peerId });
        });
        this.connections.clear();
    }

    /**
     * Get current device ID
     */
    getDeviceId(): string {
        return this.deviceId;
    }

    /**
     * Get list of currently connected peer IDs
     */
    getConnectedPeers(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Check if connected to a specific peer
     */
    isConnectedTo(peerId: string): boolean {
        return this.connections.has(peerId);
    }

    /**
     * Subscribe to connection events
     */
    onConnectionChange(callback: ConnectionCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Emit an event to all subscribers
     */
    private emit(event: ConnectionEvent): void {
        this.callbacks.forEach(callback => callback(event));
    }

    /**
     * Core Sync Logic - syncs goals, constraints, and settings (policies)
     */
    async sync(): Promise<void> {
        if (this.isSyncing) return;
        if (this.connections.size === 0) return;

        this.isSyncing = true;

        try {
            console.log('[SyncAgent] Sync started...');

            // Fetch all syncable data
            const goals = await db.goals.toArray();
            const constraints = await db.constraints.toArray();
            const settings = await db.settings.toArray();

            const packet = {
                type: 'SYNC_DATA',
                source: this.deviceId,
                payload: {
                    goals: goals,
                    constraints: constraints,
                    settings: settings
                },
                timestamp: Date.now()
            };

            const message = JSON.stringify(packet);
            this.broadcast(message);

            console.log(`[SyncAgent] Broadcasting ${goals.length} goals, ${constraints.length} constraints, ${settings.length} settings`);

        } catch (err) {
            console.error('[SyncAgent] Sync error:', err);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Broadcast message to all connected peers
     */
    private broadcast(msg: string): void {
        this.connections.forEach((conn, peerId) => {
            try {
                conn.send(msg);
            } catch (err) {
                console.error('[SyncAgent] Failed to send to:', peerId, err);
            }
        });
    }

    /**
     * Handles incoming sync messages - processes goals, constraints, and settings
     */
    async handleMessage(msg: string, fromPeerId: string): Promise<void> {
        // Set flag to prevent auto-sync while receiving data
        this.isReceivingSync = true;

        try {
            const data = JSON.parse(msg);

            if (data.type === 'SYNC_DATA') {
                const syncedData: any = {};

                // ===== GOALS =====
                if (data.payload.goals) {
                    const incomingGoals = data.payload.goals;
                    const localGoals = await db.goals.toArray();

                    // Validate incoming goals - filter out invalid entries
                    const validIncomingGoals = incomingGoals.filter((goal: any) => {
                        if (goal.id !== undefined && (isNaN(goal.id) || goal.id === null)) {
                            console.warn('[SyncAgent] Skipping goal with invalid id:', goal);
                            return false;
                        }
                        return true;
                    });

                    const mergedGoals = ConflictResolver.mergeLists(
                        localGoals as any[],
                        validIncomingGoals
                    );

                    if (mergedGoals.length > 0) {
                        await db.goals.bulkPut(mergedGoals as Goal[]);
                        console.log(`[SyncAgent] Synced ${mergedGoals.length} goals from ${fromPeerId}`);
                        syncedData.goals = mergedGoals;
                    }
                }

                // ===== CONSTRAINTS =====
                if (data.payload.constraints) {
                    const incomingConstraints = data.payload.constraints;
                    const localConstraints = await db.constraints.toArray();

                    // Validate incoming constraints
                    const validIncomingConstraints = incomingConstraints.filter((constraint: any) => {
                        if (constraint.id !== undefined && (isNaN(constraint.id) || constraint.id === null)) {
                            console.warn('[SyncAgent] Skipping constraint with invalid id:', constraint);
                            return false;
                        }
                        return true;
                    });

                    const mergedConstraints = ConflictResolver.mergeLists(
                        localConstraints as any[],
                        validIncomingConstraints
                    );

                    if (mergedConstraints.length > 0) {
                        await db.constraints.bulkPut(mergedConstraints as Constraint[]);
                        console.log(`[SyncAgent] Synced ${mergedConstraints.length} constraints from ${fromPeerId}`);
                        syncedData.constraints = mergedConstraints;
                    }
                }

                // ===== SETTINGS (Policies) =====
                if (data.payload.settings) {
                    const incomingSettings = data.payload.settings;
                    const localSettings = await db.settings.toArray();

                    // Settings use 'key' as unique identifier, not 'id'
                    for (const remoteSetting of incomingSettings) {
                        if (!remoteSetting.key) continue;

                        const localSetting = localSettings.find(s => s.key === remoteSetting.key);

                        if (localSetting) {
                            // LWW for settings based on updatedAt
                            if (remoteSetting.updatedAt > (localSetting.updatedAt || 0)) {
                                await db.settings.put(remoteSetting);
                                console.log(`[SyncAgent] Updated setting '${remoteSetting.key}' from ${fromPeerId}`);
                            }
                        } else {
                            // New setting from remote
                            await db.settings.put(remoteSetting);
                            console.log(`[SyncAgent] Added new setting '${remoteSetting.key}' from ${fromPeerId}`);
                        }
                    }
                    syncedData.settings = incomingSettings;
                }

                this.emit({ type: 'data', peerId: fromPeerId, data: syncedData });

                // BIDIRECTIONAL SYNC: Send our data back to the peer if this was an initial sync request
                // Only respond if this wasn't already a response (to prevent infinite ping-pong)
                if (!data.isResponse) {
                    console.log(`[SyncAgent] Sending sync response back to ${fromPeerId}`);
                    this.sendSyncTo(fromPeerId, true); // true = isResponse
                }
            }
        } catch (err) {
            console.error('[SyncAgent] Failed to handle message:', err);
        } finally {
            // Reset flag after processing
            this.isReceivingSync = false;
        }
    }

    /**
     * Send sync data to a specific peer
     */
    private async sendSyncTo(peerId: string, isResponse: boolean = false): Promise<void> {
        const conn = this.connections.get(peerId);
        if (!conn) return;

        try {
            const goals = await db.goals.toArray();
            const constraints = await db.constraints.toArray();
            const settings = await db.settings.toArray();

            const packet = {
                type: 'SYNC_DATA',
                source: this.deviceId,
                isResponse: isResponse, // Mark as response to prevent ping-pong
                payload: {
                    goals: goals,
                    constraints: constraints,
                    settings: settings
                },
                timestamp: Date.now()
            };

            conn.send(JSON.stringify(packet));
            console.log(`[SyncAgent] Sent sync ${isResponse ? 'response' : 'request'} to ${peerId}`);
        } catch (err) {
            console.error('[SyncAgent] Failed to send sync to:', peerId, err);
        }
    }

    /**
     * Destroy the sync agent
     */
    destroy(): void {
        this.disconnectAll();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.isInitialized = false;
        this.initPromise = null;
        SyncAgent.instance = null;
    }
}
