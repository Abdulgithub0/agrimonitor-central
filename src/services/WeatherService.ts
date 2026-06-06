import { WeatherAPIClient } from '../integrations/WeatherAPIClient';
import { CacheManager } from '../cache/CacheManager';
import { WeatherJobQueue } from '../queue/WeatherJobQueue';
import { PayloadOptimizer, OptimizedWeatherPayload } from './PayloadOptimizer';

// Ties together the API client, cache, queue, and optimizer.
// All weather data flows through here before reaching the controller.
export class WeatherService {
    private apiClient: WeatherAPIClient;
    private cache: CacheManager;
    private queue: WeatherJobQueue;
    private optimizer: PayloadOptimizer;

    constructor() {
        this.apiClient  = new WeatherAPIClient();
        this.cache      = new CacheManager(1200); // 20 min TTL
        this.queue      = new WeatherJobQueue();
        this.optimizer  = new PayloadOptimizer();
    }

    public async getWeatherForLocations(
        locations: { lat: number; lon: number }[],
        ai = false
    ): Promise<OptimizedWeatherPayload[]> {
        const promises = locations.map(async (loc) => {
            const key = CacheManager.generateKey(loc.lat, loc.lon) + (ai ? ':ai' : '');
            const hit  = this.cache.get<OptimizedWeatherPayload>(key);
            if (hit) return hit;

            const raw       = await this.queue.add(() => this.fetchWithRetry(loc.lat, loc.lon, ai));
            const optimized = this.optimizer.optimize(raw, loc.lat, loc.lon);
            this.cache.set(key, optimized);
            return optimized;
        });

        return Promise.all(promises);
    }

    public async getGeoDetect(ai = false): Promise<{ weather: OptimizedWeatherPayload; geo: { city?: string; region?: string; country?: string } }> {
        const { data, city, region, country } = await this.apiClient.getWeatherGeo(ai);
        const lat = data?.location?.lat ?? 0;
        const lon = data?.location?.lon ?? 0;
        return {
            weather: this.optimizer.optimize(data, lat, lon),
            geo: { city, region, country }
        };
    }

    public async getUsage(): Promise<any> {
        return this.apiClient.getUsage();
    }

    public async getTreeQuota(): Promise<any> {
        return this.apiClient.getTreeQuota();
    }

    public async analyzeTreeImage(
        imageBuffer: Buffer,
        filename: string,
        mimetype: string,
        extras: Record<string, string>
    ): Promise<any> {
        return this.apiClient.analyzeTreeImage(imageBuffer, filename, mimetype, extras);
    }

    public async getTreeHistory(limit = 20): Promise<any> {
        return this.apiClient.getTreeHistory(limit);
    }

    // Linear backoff on 429: 2s - 4s - 6s
    private async fetchWithRetry(lat: number, lon: number, ai: boolean, retries = 3): Promise<any> {
        try {
            return await this.apiClient.getCurrentWeather(lat, lon, ai);
        } catch (err: any) {
            if (err?.response?.status === 429 && retries > 0) {
                await new Promise(r => setTimeout(r, (4 - retries) * 2000));
                return this.fetchWithRetry(lat, lon, ai, retries - 1);
            }
            throw err;
        }
    }
}
