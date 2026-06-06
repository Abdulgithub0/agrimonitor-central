export interface HourlyEntry {
    time: string;
    temperature: number;
    precipitation_probability: number;
    wind_speed: number;
    condition_code: string;
    icon: string;
    humidity: number;
    feels_like: number;
    wind_gust: number;
    uv_index: number;
}

export interface DailyEntry {
    date: string;
    temp_min: number;
    temp_max: number;
    precipitation_sum: number;
    sunrise: string;
    sunset: string;
    condition_code: string;
    icon: string;
    precipitation_probability: number;
    wind_max: number;
}

export interface OptimizedWeatherPayload {
    location: {
        lat: number;
        lon: number;
        country?: string;
        timezone?: string;
    };
    current: {
        time: string;
        temperature: number;
        feels_like: number;
        humidity: number;
        wind_speed: number;
        wind_gust: number;
        wind_direction: number;
        uv_index: number;
        condition_code: string;
        icon: string;
    };
    hourly: HourlyEntry[];
    daily: DailyEntry[];
    alerts: string[];
    anomalies: Array<{ time: string; issue: string; value: number }>;
}

// Normalises the raw API response into a consistent shape for the frontend.
// Also runs alert and anomaly detection so the client doesn't have to.
export class PayloadOptimizer {

    public optimize(rawData: any, lat: number, lon: number): OptimizedWeatherPayload {
        const raw = rawData?.current ?? {};
        const hourlyList: any[] = Array.isArray(rawData?.hourly) ? rawData.hourly : [];
        const dailyList: any[] = Array.isArray(rawData?.daily) ? rawData.daily : [];
        const rawLoc = rawData?.location ?? {};

        // The /current object omits humidity, feels_like, wind_gust, and uv_index -
        // those only appear in the hourly array, so we pull from the matching hour.
        const currentHour = this.findCurrentHour(hourlyList, raw.time);

        const temperature = raw.temperature ?? 0;
        const feels_like  = currentHour?.feels_like ?? temperature;
        const humidity     = currentHour?.humidity ?? 0;
        const wind_speed   = raw.wind_speed ?? 0;
        const wind_gust    = currentHour?.wind_gust ?? wind_speed;
        const wind_direction = raw.wind_direction ?? 0;
        const uv_index     = currentHour?.uv_index ?? 0;
        const condition_code = String(raw.condition_code ?? '0');
        const icon         = raw.icon ?? '';

        const hourly: HourlyEntry[] = hourlyList.slice(0, 24).map((h: any) => ({
            time: h.time ?? '',
            temperature: h.temperature ?? 0,
            precipitation_probability: h.precipitation_probability ?? 0,
            wind_speed: h.wind_speed ?? 0,
            condition_code: String(h.condition_code ?? '0'),
            icon: h.icon ?? '',
            humidity: h.humidity ?? 0,
            feels_like: h.feels_like ?? 0,
            wind_gust: h.wind_gust ?? 0,
            uv_index: h.uv_index ?? 0
        }));

        const daily: DailyEntry[] = dailyList.slice(0, 7).map((d: any) => ({
            date: d.date ?? '',
            temp_min: d.temp_min ?? 0,
            temp_max: d.temp_max ?? 0,
            precipitation_sum: d.precipitation_sum ?? 0,
            sunrise: d.sunrise ?? '',
            sunset: d.sunset ?? '',
            condition_code: String(d.condition_code ?? '0'),
            icon: d.icon ?? '',
            precipitation_probability: d.precipitation_probability ?? 0,
            wind_max: d.wind_max ?? 0
        }));

        return {
            location: {
                lat: rawLoc.requested_lat ?? lat,
                lon: rawLoc.requested_lon ?? lon,
                country: rawLoc.country,
                timezone: rawLoc.timezone
            },
            current: { time: raw.time ?? '', temperature, feels_like, humidity, wind_speed, wind_gust, wind_direction, uv_index, condition_code, icon },
            hourly,
            daily,
            alerts: this.buildAlerts(temperature, wind_speed, wind_gust, uv_index),
            anomalies: this.buildAnomalies(hourlyList)
        };
    }

    // Match on the first 13 chars, e.g. "2026-06-06T14"
    private findCurrentHour(hourlyList: any[], currentTime?: string): any {
        if (!currentTime || !hourlyList.length) return hourlyList[0];
        const target = currentTime.slice(0, 13);
        return hourlyList.find(h => String(h.time ?? '').startsWith(target)) ?? hourlyList[0];
    }

    private buildAlerts(temp: number, windSpeed: number, windGust: number, uvIndex: number): string[] {
        const out: string[] = [];
        if (temp > 35)                          out.push('CRITICAL: Heat stress-temperature exceeds 35°C.');
        else if (temp < 5)                      out.push('WARNING: Frost risk-temperature below 5°C.');
        if (windGust > 60 || windSpeed > 50)    out.push('WARNING: High winds-secure poultry houses and polytunnels.');
        if (uvIndex > 8)                        out.push('WARNING: Extreme UV-limit field worker exposure.');
        return out;
    }

    private buildAnomalies(hourlyList: any[]): Array<{ time: string; issue: string; value: number }> {
        const out: Array<{ time: string; issue: string; value: number }> = [];
        for (const h of hourlyList) {
            const t = h.temperature ?? 0;
            const p = h.precipitation_probability ?? 0;
            if (t > 38)   out.push({ time: h.time, issue: 'Extreme heat', value: t });
            else if (t < 0) out.push({ time: h.time, issue: 'Below-zero temp', value: t });
            if (p >= 80)  out.push({ time: h.time, issue: 'Heavy rain risk', value: p });
        }
        return out.slice(0, 5);
    }
}
