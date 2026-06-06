import NodeCache from 'node-cache';

export class CacheManager {
    private cache: NodeCache;

    constructor(ttlSeconds = 1200) {
        this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: 120 });
    }

    public get<T>(key: string): T | undefined {
        return this.cache.get<T>(key);
    }

    public set<T>(key: string, value: T): void {
        this.cache.set(key, value);
    }

    // Truncate to 4dp so requests for nearby coordinates share the same cache entry
    public static generateKey(lat: number, lon: number): string {
        return `weather:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    }
}
