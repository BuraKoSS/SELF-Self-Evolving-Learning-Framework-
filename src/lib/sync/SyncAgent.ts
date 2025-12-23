import { db, Goal, Session } from '../../db/db';
import { ConflictResolver } from './ConflictResolver';

// Mock WebRTC Peer for non-Server environment
class MockPeer {
    id: string;
    connected: boolean = false;

    constructor(id: string) {
        this.id = id;
    }

    send(data: string) {
        console.log(`[MockPeer ${this.id}] Sending:`, data);
    }
}

export class SyncAgent {
    private static instance: SyncAgent;
    private peers: Map<string, MockPeer> = new Map();
    private deviceId: string;
    private isSyncing: boolean = false;

    private constructor() {
        this.deviceId = `device-${Math.random().toString(36).substr(2, 9)}`;
    }

    static getInstance(): SyncAgent {
        if (!SyncAgent.instance) {
            SyncAgent.instance = new SyncAgent();
        }
        return SyncAgent.instance;
    }

    /**
     * Starts the sync agent, connecting to signaling server (mock)
     */
    start() {
        console.log(`[SyncAgent] Starting on device: ${this.deviceId}`);
        // Mock connecting to signaling server
        setTimeout(() => {
            this.connectToPeer('mock-remote-peer');
        }, 1000);
    }

    connectToPeer(peerId: string) {
        if (this.peers.has(peerId)) return;
        const peer = new MockPeer(peerId);
        peer.connected = true;
        this.peers.set(peerId, peer);
        console.log(`[SyncAgent] Connected to ${peerId}`);

        // Trigger initial sync
        this.sync();
    }

    /**
     * Core Sync Logic
     * 1. Fetch changes since last sync
     * 2. Send changes to peers
     * 3. Receive changes (Mocked here)
     */
    async sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            console.log('[SyncAgent] Sync started...');

            const goals = await db.goals.toArray();
            // Filter for unsynced changes would go here

            const packet = {
                type: 'SYNC_DATA',
                source: this.deviceId,
                payload: {
                    goals: goals
                },
                timestamp: Date.now()
            };

            this.broadcast(JSON.stringify(packet));

        } catch (err) {
            console.error('[SyncAgent] Sync error:', err);
        } finally {
            this.isSyncing = false;
        }
    }

    broadcast(msg: string) {
        this.peers.forEach(peer => peer.send(msg));
    }

    /**
     * Handles incoming sync messages
     */
    async handleMessage(msg: string) {
        const data = JSON.parse(msg);
        if (data.type === 'SYNC_DATA') {
            const incomingGoals = data.payload.goals;
            const localGoals = await db.goals.toArray();

            const mergedGoals = ConflictResolver.mergeLists(
                localGoals as any[],
                incomingGoals
            );

            // Bulk put merged data back to DB
            await db.goals.bulkPut(mergedGoals as Goal[]);
            console.log(`[SyncAgent] Synced ${mergedGoals.length} goals.`);
        }
    }
}
