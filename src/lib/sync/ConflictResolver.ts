export interface SyncableEntity {
    id?: number;
    uuid?: string;
    updatedAt: number;
    version?: number;
    isDeleted?: boolean;
    vectorClock?: Record<string, number>;
}

export class ConflictResolver {
    /**
     * Resolves conflict between two entities using Last-Write-Wins (LWW) strategy.
     * Enhanced with vector clock support for more accurate conflict detection.
     * @param local Local entity
     * @param remote Remote entity
     * @param deviceId Optional device ID for vector clock updates
     * @returns The winning entity (merged result)
     */
    static resolve<T extends SyncableEntity>(local: T, remote: T, deviceId?: string): T {
        if (!local || !remote) return remote || local;

        // Check for soft-deleted items
        if (local.isDeleted && !remote.isDeleted) {
            // If local is deleted but remote is not, check timestamps
            if (remote.updatedAt > local.updatedAt) {
                return remote; // Remote "un-deleted" the item
            }
            return local; // Keep deleted
        }

        if (remote.isDeleted && !local.isDeleted) {
            if (remote.updatedAt > local.updatedAt) {
                return { ...local, isDeleted: true, updatedAt: remote.updatedAt };
            }
            return local;
        }

        // Vector clock comparison if available
        if (local.vectorClock && remote.vectorClock) {
            const comparison = this.compareVectorClocks(local.vectorClock, remote.vectorClock);

            if (comparison === 'remote') return remote;
            if (comparison === 'local') return local;
            // If concurrent, fall through to timestamp-based resolution
        }

        // Version-based comparison if available
        if (local.version !== undefined && remote.version !== undefined) {
            if (remote.version > local.version) return remote;
            if (local.version > remote.version) return local;
            // If versions equal, fall through to timestamp
        }

        // LWW: If remote is newer, it wins
        if (remote.updatedAt > local.updatedAt) {
            return remote;
        }

        // Threshold-based merge for nearly simultaneous edits (within 1 second)
        const timeDiff = Math.abs(remote.updatedAt - local.updatedAt);
        if (timeDiff < 1000) {
            // Merge fields - remote wins on conflicts, but keep local-only fields
            return this.mergeFields(local, remote);
        }

        // Favor local to avoid churn if identical timestamps
        return local;
    }

    /**
     * Compare two vector clocks
     * @returns 'local' if local is newer, 'remote' if remote is newer, 'concurrent' if neither
     */
    private static compareVectorClocks(
        local: Record<string, number>,
        remote: Record<string, number>
    ): 'local' | 'remote' | 'concurrent' {
        const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
        let localNewer = false;
        let remoteNewer = false;

        for (const key of allKeys) {
            const localVal = local[key] || 0;
            const remoteVal = remote[key] || 0;

            if (localVal > remoteVal) localNewer = true;
            if (remoteVal > localVal) remoteNewer = true;
        }

        if (localNewer && !remoteNewer) return 'local';
        if (remoteNewer && !localNewer) return 'remote';
        return 'concurrent';
    }

    /**
     * Merge fields from two objects, remote wins on conflicts
     */
    private static mergeFields<T extends SyncableEntity>(local: T, remote: T): T {
        const merged = { ...local };

        for (const key of Object.keys(remote) as (keyof T)[]) {
            if (key === 'id' || key === 'uuid') continue; // Never merge IDs

            const localVal = local[key];
            const remoteVal = remote[key];

            // If local doesn't have the field, use remote
            if (localVal === undefined && remoteVal !== undefined) {
                (merged as any)[key] = remoteVal;
            }
            // If values are different, use the one from the newer timestamp
            else if (localVal !== remoteVal && remote.updatedAt >= local.updatedAt) {
                (merged as any)[key] = remoteVal;
            }
        }

        // Update timestamp and increment version
        merged.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
        merged.version = Math.max(local.version || 0, remote.version || 0) + 1;

        return merged;
    }

    /**
     * Increment vector clock for a device
     */
    static incrementVectorClock(
        entity: SyncableEntity,
        deviceId: string
    ): Record<string, number> {
        const clock = { ...(entity.vectorClock || {}) };
        clock[deviceId] = (clock[deviceId] || 0) + 1;
        return clock;
    }

    /**
     * Merges two lists of entities based on IDs and LWW.
     * Enhanced to handle soft-deletes properly.
     * @param localList List of local entities
     * @param remoteList List of remote entities
     * @param deviceId Optional device ID for vector clock
     * @returns Merged list
     */
    static mergeLists<T extends SyncableEntity>(
        localList: T[],
        remoteList: T[],
        deviceId?: string
    ): T[] {
        const map = new Map<string | number, T>();

        // Index local items
        for (const item of localList) {
            const key = item.uuid || item.id;
            if (key !== undefined && key !== null) {
                map.set(key, item);
            }
        }

        // Merge remote items
        for (const remoteItem of remoteList) {
            const key = remoteItem.uuid || remoteItem.id;
            if (key === undefined || key === null) continue;

            // Validate id is a valid number if it exists
            if (remoteItem.id !== undefined) {
                if (typeof remoteItem.id !== 'number' || isNaN(remoteItem.id)) {
                    console.warn('[ConflictResolver] Skipping item with invalid id:', remoteItem);
                    continue;
                }
            }

            const localItem = map.get(key);
            if (localItem) {
                const winner = this.resolve(localItem, remoteItem, deviceId);
                map.set(key, winner);
            } else {
                map.set(key, remoteItem);
            }
        }

        // Return all items INCLUDING soft-deleted ones
        // Soft-deleted items MUST be synced to other devices
        // The UI layer will filter them out when displaying
        return Array.from(map.values());
    }

    /**
     * Create a new syncable entity with proper metadata
     */
    static createSyncableEntity<T>(
        data: T,
        deviceId: string
    ): T & SyncableEntity {
        const now = Date.now();
        return {
            ...data,
            updatedAt: now,
            version: 1,
            isDeleted: false,
            vectorClock: { [deviceId]: 1 }
        };
    }

    /**
     * Mark an entity as deleted (soft delete)
     */
    static softDelete<T extends SyncableEntity>(
        entity: T,
        deviceId: string
    ): T {
        return {
            ...entity,
            isDeleted: true,
            updatedAt: Date.now(),
            version: (entity.version || 0) + 1,
            vectorClock: this.incrementVectorClock(entity, deviceId)
        };
    }
}
