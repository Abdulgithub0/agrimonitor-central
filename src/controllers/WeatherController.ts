import { Request, Response } from 'express';
import { WeatherService } from '../services/WeatherService';

export class WeatherController {
    private svc: WeatherService;

    constructor() {
        this.svc = new WeatherService();
    }

    // GET /api/locations/weather?locations=lat,lon|lat,lon&ai=false
    public async getMultiLocationWeather(req: Request, res: Response): Promise<void> {
        try {
            const locationsQuery = req.query.locations as string;
            if (!locationsQuery) {
                res.status(400).json({ error: 'Missing "locations" query param. Format: lat,lon|lat,lon' });
                return;
            }

            const ai = req.query.ai === 'true';
            const locations = locationsQuery.split('|').map(loc => {
                const [lat, lon] = loc.split(',');
                return { lat: parseFloat(lat), lon: parseFloat(lon) };
            });

            if (!locations.every(l => isFinite(l.lat) && isFinite(l.lon))) {
                res.status(400).json({ error: 'Invalid coordinate format. Ensure lat and lon are valid floats.' });
                return;
            }

            res.json(await this.svc.getWeatherForLocations(locations, ai));
        } catch (err) {
            console.error('[WeatherController] getMultiLocationWeather:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    // GET /api/geo-detect
    public async getGeoDetect(req: Request, res: Response): Promise<void> {
        try {
            res.json(await this.svc.getGeoDetect(req.query.ai === 'true'));
        } catch (err) {
            console.error('[WeatherController] getGeoDetect:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    // GET /api/usage
    public async getUsage(_req: Request, res: Response): Promise<void> {
        try {
            res.json(await this.svc.getUsage());
        } catch (err) {
            console.error('[WeatherController] getUsage:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    // GET /api/trees/quota
    public async getTreeQuota(_req: Request, res: Response): Promise<void> {
        try {
            res.json(await this.svc.getTreeQuota());
        } catch (err) {
            console.error('[WeatherController] getTreeQuota:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }

    // POST /api/trees/analyze  (multipart/form-data)
    public async analyzeTree(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'Image file is required.' });
                return;
            }

            const extras: Record<string, string> = {};
            for (const key of ['farmerId', 'county', 'landAcres', 'location', 'notes']) {
                if (req.body[key]) extras[key] = req.body[key];
            }

            res.json(await this.svc.analyzeTreeImage(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                extras
            ));
        } catch (err) {
            console.error('[WeatherController] analyzeTree:', err);
            res.status(500).json({ error: 'Tree analysis failed.' });
        }
    }

    // GET /api/trees/history
    public async getTreeHistory(req: Request, res: Response): Promise<void> {
        try {
            const limit = parseInt(req.query.limit as string) || 20;
            res.json(await this.svc.getTreeHistory(limit));
        } catch (err) {
            console.error('[WeatherController] getTreeHistory:', err);
            res.status(500).json({ error: 'Internal server error.' });
        }
    }
}
