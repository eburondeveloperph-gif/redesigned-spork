import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for retrieving weather forecasts.
 * Provides actual weather data using Open-Meteo API (free, no API key required).
 */
export class WeatherTool {
    constructor() {
        // Default coordinates for demo (Manila, Philippines)
        this.defaultLocation = { lat: 14.5995, lon: 120.9842 };
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'weather',
            description: 'Get current weather conditions and forecast for any location. Use this when the user asks about weather, temperature, or forecast.',
            parameters: {
                type: 'object',
                properties: {
                    location: {
                        type: 'string',
                        description: 'City name or location (e.g., "Tokyo", "New York, USA")'
                    },
                    days: {
                        type: 'number',
                        description: 'Number of forecast days (1-16, default 7)'
                    }
                },
                required: ['location']
            }
        };
    }

    /**
     * Execute the weather tool.
     */
    async execute(args) {
        try {
            Logger.info('Executing Weather Tool', args);
            const { location, days = 7 } = args;

            // First, geocode the location
            const geoResult = await this.geocodeLocation(location);
            if (!geoResult) {
                throw new Error(`Could not find location: ${location}`);
            }

            const { lat, lon, name, country } = geoResult;

            // Fetch current weather
            const currentWeather = await this.fetchCurrentWeather(lat, lon);

            // Fetch forecast
            const forecast = await this.fetchForecast(lat, lon, days);

            return {
                success: true,
                location: name,
                country: country,
                current: currentWeather,
                forecast: forecast,
                formatted: `Current weather in ${name}, ${country}: ${currentWeather.temperature}°C, ${currentWeather.condition}. ${forecast.summary}`
            };

        } catch (error) {
            Logger.error('Weather Tool failed', error);
            throw error;
        }
    }

    /**
     * Geocode a location name to coordinates.
     */
    async geocodeLocation(location) {
        try {
            const response = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
            );
            
            if (!response.ok) throw new Error('Geocoding failed');
            
            const data = await response.json();
            if (!data.results || data.results.length === 0) return null;

            const result = data.results[0];
            return {
                lat: result.latitude,
                lon: result.longitude,
                name: result.name,
                country: result.country || ''
            };
        } catch (error) {
            Logger.error('Geocoding failed', error);
            return null;
        }
    }

    /**
     * Fetch current weather data.
     */
    async fetchCurrentWeather(lat, lon) {
        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
            );
            
            if (!response.ok) throw new Error('Weather API failed');
            
            const data = await response.json();
            const current = data.current;

            return {
                temperature: current.temperature_2m,
                humidity: current.relative_humidity_2m,
                windSpeed: current.wind_speed_10m,
                condition: this.getWeatherCondition(current.weather_code),
                weatherCode: current.weather_code
            };
        } catch (error) {
            Logger.error('Current weather fetch failed', error);
            throw error;
        }
    }

    /**
     * Fetch weather forecast.
     */
    async fetchForecast(lat, lon, days) {
        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=${days}`
            );
            
            if (!response.ok) throw new Error('Forecast API failed');
            
            const data = await response.json();
            const daily = data.daily;

            const forecastDays = daily.time.map((date, i) => ({
                date: date,
                high: daily.temperature_2m_max[i],
                low: daily.temperature_2m_min[i],
                condition: this.getWeatherCondition(daily.weather_code[i]),
                precipitationChance: daily.precipitation_probability_max[i]
            }));

            return {
                days: forecastDays,
                summary: `Forecast for ${days} days: High of ${Math.max(...daily.temperature_2m_max)}°C, low of ${Math.min(...daily.temperature_2m_min)}°C`
            };
        } catch (error) {
            Logger.error('Forecast fetch failed', error);
            throw error;
        }
    }

    /**
     * Convert WMO weather code to human-readable condition.
     */
    getWeatherCondition(code) {
        const conditions = {
            0: 'clear sky',
            1: 'mainly clear',
            2: 'partly cloudy',
            3: 'overcast',
            45: 'foggy',
            48: 'depositing rime fog',
            51: 'light drizzle',
            53: 'moderate drizzle',
            55: 'dense drizzle',
            56: 'light freezing drizzle',
            57: 'dense freezing drizzle',
            61: 'slight rain',
            63: 'moderate rain',
            65: 'heavy rain',
            66: 'light freezing rain',
            67: 'heavy freezing rain',
            71: 'slight snow',
            73: 'moderate snow',
            75: 'heavy snow',
            77: 'snow grains',
            80: 'slight rain showers',
            81: 'moderate rain showers',
            82: 'violent rain showers',
            85: 'slight snow showers',
            86: 'heavy snow showers',
            95: 'thunderstorm',
            96: 'thunderstorm with slight hail',
            99: 'thunderstorm with heavy hail'
        };
        return conditions[code] || 'unknown';
    }
}
