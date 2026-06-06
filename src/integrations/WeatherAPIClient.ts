import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';

// Thin wrapper around the WeatherAI REST API.
// Auth is injected via interceptor so individual methods stay clean.
export class WeatherAPIClient {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: 'https://api.weather-ai.co/v1',
            timeout: 15000,
            family: 4
        });

        this.client.interceptors.request.use((config) => {
            const key = process.env.WEATHER_API_KEY;
            if (key) config.headers['Authorization'] = `Bearer ${key}`;
            return config;
        });
    }

    public async getCurrentWeather(lat: number, lon: number, ai = false): Promise<any> {
        const res = await this.client.get('/current', { params: { lat, lon, ai } });
        return res.data;
    }

    public async getDailyForecast(lat: number, lon: number, days = 7, ai = false): Promise<any> {
        const res = await this.client.get('/daily', { params: { lat, lon, days, ai } });
        return res.data;
    }

    public async getHourlyForecast(lat: number, lon: number, days = 1, ai = false): Promise<any> {
        const res = await this.client.get('/hourly', { params: { lat, lon, days, ai } });
        return res.data;
    }

    public async getWeatherGeo(ai = false): Promise<{ data: any; city?: string; region?: string; country?: string }> {
        const res = await this.client.get('/weather-geo', { params: { ip: 'auto', ai } });
        return {
            data: res.data,
            city: res.headers['x-city'] as string | undefined,
            region: res.headers['x-region'] as string | undefined,
            country: res.headers['x-country'] as string | undefined
        };
    }

    public async getUsage(): Promise<any> {
        return (await this.client.get('/usage')).data;
    }

    public async getTreeQuota(): Promise<any> {
        return (await this.client.get('/trees/quota')).data;
    }

    // Reconstructs the file as multipart and proxies it to the Trees API.
    // multer gives us the buffer in memory-no temp files involved.
    public async analyzeTreeImage(
        imageBuffer: Buffer,
        filename: string,
        mimetype: string,
        extras: Record<string, string> = {}
    ): Promise<any> {
        const form = new FormData();
        form.append('image', imageBuffer, { filename, contentType: mimetype });
        for (const [k, v] of Object.entries(extras)) {
            if (v) form.append(k, v);
        }
        const res = await this.client.post('/trees/analyze', form, {
            headers: form.getHeaders(),
            timeout: 60000
        });
        return res.data;
    }

    public async getTreeHistory(limit = 20): Promise<any> {
        return (await this.client.get('/trees/history', { params: { limit } })).data;
    }
}
