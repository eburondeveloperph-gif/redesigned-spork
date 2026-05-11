import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Geolocation operations.
 * Allows the agent to get user's current location.
 */
export class GeolocationTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Geolocation API calls.
     * @param {string} token - The OAuth access token.
     */
    setAccessToken(token) {
        this.accessToken = token;
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'geolocation',
            description: 'Get the user\'s current geolocation coordinates (latitude and longitude)',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: get_current_location',
                        enum: ['get_current_location']
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Geolocation operation.
     */
    async execute(args) {
        try {
            const { action } = args;
            
            if (action !== 'get_current_location') {
                throw new Error(`Unknown Geolocation action: ${action}`);
            }

            // Use browser's Geolocation API
            return await this.getCurrentLocation();
        } catch (error) {
            Logger.error('Geolocation tool execution failed', error);
            throw error;
        }
    }

    /**
     * Gets the user's current location using browser Geolocation API.
     */
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    });
                },
                (error) => {
                    reject(new Error(`Geolocation error: ${error.message}`));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
}
