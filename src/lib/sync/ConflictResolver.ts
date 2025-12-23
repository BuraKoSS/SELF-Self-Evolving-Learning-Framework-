export class ConflictResolver {
    /**
     * Resolves conflict between two entities using Last-Write-Wins (LWW) strategy.
     * Assumes entities have an 'updatedAt' timestamp.
     * @param local Local entity
     * @param remote Remote entity
     * @returns The winning entity (merged result)
     */
    static resolve<T extends { updatedAt: number }>(local: T, remote: T): T {
        if (!local || !remote) return remote || local;

        // LWW: If remote is newer, it wins
        if (remote.updatedAt > local.updatedAt) {
            return remote;
        }

        // If timestamps are equal, we need a tie-breaker. 
        // Usually usage of a UUID sort or similar is good, but for now favor local to avoid churn if identical.
        return local;
    }

    /**
     * Merges two lists of entities based on IDs and LWW.
     * @param localList List of local entities
     * @param remoteList List of remote entities
     * @returns Merged list
     */
    static mergeLists<T extends { id?: number; uuid?: string; updatedAt: number }>(
        localList: T[],
        remoteList: T[]
    ): T[] {
        const map = new Map<string | number, T>();

        // Index local items
        for (const item of localList) {
            const key = item.uuid || item.id;
            if (key) map.set(key, item);
        }

        // Merge remote items
        for (const remoteItem of remoteList) {
            const key = remoteItem.uuid || remoteItem.id;
            if (!key) continue;

            const localItem = map.get(key);
            if (localItem) {
                const winner = this.resolve(localItem, remoteItem);
                map.set(key, winner);
            } else {
                map.set(key, remoteItem);
            }
        }

        return Array.from(map.values());
    }
}
