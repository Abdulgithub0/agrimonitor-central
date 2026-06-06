# AgriMonitor Central

A smart farming weather dashboard that pulls live conditions, hourly forecasts, and 7-day outlooks for multiple farm locations simultaneously. Built on top of the WeatherAI API with a Node.js/Express backend that handles caching, rate limiting, and payload optimisation so the frontend stays simple.

## Features

- **Multi-farm dashboard** - add as many farm locations as you need; weather loads in parallel
- **GPS + place-name search** - locate your farm without typing raw coordinates
- **Auto-detect** - detect your current IP location and add it as a farm in one click
- **Hourly SVG chart** - temperature line + precipitation probability bars, drawn without a chart library
- **7-day forecast strip** - daily min/max with weather icons per farm card
- **Automated alerts** - heat stress, frost risk, high wind, and extreme UV warnings derived from live data
- **Anomaly detection** - flags hours with extreme temperatures or heavy rain probability in the next 24 h
- **Tree & Canopy Analyser** - upload an aerial/drone image and get AI-powered tree count, canopy coverage, density, and health breakdown
- **AI Insights toggle** - enable Gemini-powered farming summaries per location
- **Usage monitor** - live API and AI request quota bars in the header

## Tech stack

| Layer | What |
|---|---|
| Runtime | Node.js 20, TypeScript (compiled CommonJS) |
| Server | Express 5 |
| HTTP client | Axios with Bearer auth interceptor |
| Caching | node-cache, 20-minute TTL, keyed by 4 d.p. coordinates |
| Rate limiting | p-queue (concurrency 2, 5 req/s), linear backoff on 429 |
| Image proxy | multer (memory storage) + form-data |
| Frontend | Vanilla HTML/CSS/JS - no framework |
| Geocoding | OpenStreetMap Nominatim (free, no key needed) |
| Deployment | Render (render.yaml included) |

## API routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/locations/weather` | Weather for one or more `lat,lon` pairs (`?locations=lat,lon\|lat,lon&ai=false`) |
| GET | `/api/geo-detect` | Detect location from request IP and return weather |
| GET | `/api/usage` | WeatherAI usage stats for the current billing period |
| GET | `/api/trees/quota` | Remaining tree analysis quota |
| POST | `/api/trees/analyze` | Upload an image (`multipart/form-data`) for tree analysis |
| GET | `/api/trees/history` | List of past tree analyses |

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env
echo "PORT=3000\nWEATHER_API_KEY=wai_your_key_here" > .env

# 3. Build TypeScript
npm run build

# 4. Start
npm start
```

Open `http://localhost:3000`.

For development with auto-reload: `npm run dev`

## Deploying to Render

1. Push the repo to GitHub (make sure `.env` is in `.gitignore` - it is).
2. Go to [render.com](https://render.com) - **New** - **Blueprint** - connect the repo.
3. Render reads `render.yaml` automatically.
4. Set the `WEATHER_API_KEY` environment variable in the Render dashboard (Environment tab).
5. Hit **Deploy**.

## How it works

The frontend stores farm locations in `localStorage` and sends a single batch request to `/api/locations/weather`. The backend fans out to the WeatherAI API through a concurrency-limited queue, caches each response for 20 minutes (keyed by rounded coordinates), and runs alert + anomaly detection on the data before sending it back. The current object in the WeatherAI response doesn't include `humidity`, `feels_like`, `wind_gust`, or `uv_index`, those are pulled from the matching hour in the hourly array before the payload reaches the client.
