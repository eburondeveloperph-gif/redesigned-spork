import { Logger } from '../utils/logger.js';
import { CONFIG } from '../config/config.js';

/**
 * Hermes Agent Service
 * Connects Beatrice to Hermes agent for enhanced AI capabilities
 */
export class HermesAgentService {
    constructor() {
        this.connected = false;
        this.agentEndpoint = null;
        this.username = null;
        this.password = null;
        this.accessToken = null;
    }

    /**
     * Initialize Hermes agent connection from config
     */
    async initialize(password = null) {
        try {
            const config = CONFIG.HERMES_AGENT;
            
            if (!config || !config.ENABLED) {
                Logger.warn('Hermes Agent is disabled in config');
                return { success: false, error: 'Hermes Agent disabled' };
            }

            this.agentEndpoint = config.ENDPOINT || null;
            this.username = config.USERNAME || null;
            this.password = password || config.PASSWORD || null;
            this.accessToken = config.ACCESS_TOKEN || this.accessToken;

            if (!this.agentEndpoint) {
                Logger.warn('Hermes Agent endpoint is not configured');
                return { success: false, error: 'Hermes Agent endpoint missing' };
            }
            
            Logger.info('Hermes Agent service initializing', { endpoint: this.agentEndpoint, username: this.username });
            
            // Test connection
            const status = await this.getStatus();
            
            if (status.connected) {
                this.connected = true;
                Logger.info('Hermes Agent connected successfully');
                return { success: true, message: 'Hermes Agent connected', status };
            } else {
                Logger.warn('Hermes Agent connection test failed', status);
                return { success: false, error: 'Connection test failed', status };
            }
        } catch (error) {
            Logger.error('Failed to initialize Hermes Agent:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Set password for authentication
     */
    setPassword(password) {
        this.password = password;
    }

    /**
     * Send a request to Hermes agent
     */
    async sendRequest(request) {
        if (!this.connected) {
            throw new Error('Hermes Agent not connected');
        }

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Add authentication
            if (this.username && this.password) {
                const auth = btoa(`${this.username}:${this.password}`);
                headers['Authorization'] = `Basic ${auth}`;
            } else if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            const response = await fetch(`${this.agentEndpoint}/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    messages: request.messages || [],
                    tools: request.tools || [],
                    context: request.context || {}
                })
            });

            if (!response.ok) {
                throw new Error(`Hermes Agent request failed: ${response.statusText}`);
            }

            const data = await response.json();
            Logger.info('Hermes Agent response received', { responseId: data.id });
            
            return {
                success: true,
                response: data
            };
        } catch (error) {
            Logger.error('Hermes Agent request failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute a task through Hermes agent
     */
    async executeTask(task) {
        if (!this.connected) {
            throw new Error('Hermes Agent not connected');
        }

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Add authentication
            if (this.username && this.password) {
                const auth = btoa(`${this.username}:${this.password}`);
                headers['Authorization'] = `Basic ${auth}`;
            } else if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            const response = await fetch(`${this.agentEndpoint}/execute`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    task: task.description,
                    parameters: task.parameters || {},
                    context: task.context || {}
                })
            });

            if (!response.ok) {
                throw new Error(`Hermes Agent task execution failed: ${response.statusText}`);
            }

            const data = await response.json();
            Logger.info('Hermes Agent task executed', { taskId: data.id });
            
            return {
                success: true,
                result: data
            };
        } catch (error) {
            Logger.error('Hermes Agent task execution failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get agent status and capabilities
     */
    async getStatus() {
        try {
            const headers = {};

            // Add authentication
            if (this.username && this.password) {
                const auth = btoa(`${this.username}:${this.password}`);
                headers['Authorization'] = `Basic ${auth}`;
            } else if (this.accessToken) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
            }

            const response = await fetch(`${this.agentEndpoint}/status`, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                throw new Error(`Failed to get Hermes Agent status: ${response.statusText}`);
            }

            const data = await response.json();
            
            return {
                connected: true,
                capabilities: data.capabilities || [],
                version: data.version || 'unknown',
                status: data.status || 'active'
            };
        } catch (error) {
            Logger.error('Failed to get Hermes Agent status:', error);
            return {
                connected: false,
                error: error.message
            };
        }
    }

    /**
     * Disconnect from Hermes agent
     */
    disconnect() {
        this.connected = false;
        this.agentEndpoint = null;
        this.apiKey = null;
        this.accessToken = null;
        Logger.info('Hermes Agent disconnected');
    }

    /**
     * Set access token for authentication
     */
    setAccessToken(token) {
        this.accessToken = token;
    }
}

// Singleton instance
export const hermesAgent = new HermesAgentService();
