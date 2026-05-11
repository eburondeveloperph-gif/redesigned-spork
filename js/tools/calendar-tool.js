import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Google Calendar operations.
 * Allows the agent to manage calendar events.
 */
export class CalendarTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Calendar API calls.
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
            name: 'calendar',
            description: 'Manage Google Calendar events like creating, reading, updating, and deleting events',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: create, read, update, delete, list',
                        enum: ['create', 'read', 'update', 'delete', 'list']
                    },
                    eventId: {
                        type: 'string',
                        description: 'Event ID for read, update, delete actions'
                    },
                    summary: {
                        type: 'string',
                        description: 'Event title (for create/update)'
                    },
                    description: {
                        type: 'string',
                        description: 'Event description (for create/update)'
                    },
                    start: {
                        type: 'string',
                        description: 'Event start time in ISO format (for create/update)'
                    },
                    end: {
                        type: 'string',
                        description: 'Event end time in ISO format (for create/update)'
                    },
                    location: {
                        type: 'string',
                        description: 'Event location (for create/update)'
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Calendar operation.
     */
    async execute(args) {
        try {
            const { action, eventId, summary, description, start, end, location } = args;
            
            if (!this.accessToken) {
                throw new Error('Calendar access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'create':
                    return await this.createEvent(summary, description, start, end, location);
                case 'read':
                    return await this.readEvent(eventId);
                case 'update':
                    return await this.updateEvent(eventId, summary, description, start, end, location);
                case 'delete':
                    return await this.deleteEvent(eventId);
                case 'list':
                    return await this.listEvents();
                default:
                    throw new Error(`Unknown Calendar action: ${action}`);
            }
        } catch (error) {
            Logger.error('Calendar tool execution failed', error);
            throw error;
        }
    }

    /**
     * Creates a new calendar event.
     */
    async createEvent(summary, description, start, end, location) {
        const event = {
            summary: summary || 'Untitled Event',
            description: description || '',
            start: {
                dateTime: start || new Date().toISOString()
            },
            end: {
                dateTime: end || new Date(Date.now() + 3600000).toISOString()
            }
        };

        if (location) {
            event.location = location;
        }

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create event: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.id, htmlLink: data.htmlLink };
    }

    /**
     * Reads a specific calendar event.
     */
    async readEvent(eventId) {
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to read event: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.id,
            summary: data.summary,
            description: data.description,
            start: data.start,
            end: data.end,
            location: data.location
        };
    }

    /**
     * Updates an existing calendar event.
     */
    async updateEvent(eventId, summary, description, start, end, location) {
        const event = {};
        
        if (summary) event.summary = summary;
        if (description !== undefined) event.description = description;
        if (start) event.start = { dateTime: start };
        if (end) event.end = { dateTime: end };
        if (location !== undefined) event.location = location;

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update event: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.id };
    }

    /**
     * Deletes a calendar event.
     */
    async deleteEvent(eventId) {
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete event: ${response.statusText}`);
        }
        
        return { success: true };
    }

    /**
     * Lists upcoming calendar events.
     */
    async listEvents() {
        const timeMin = new Date().toISOString();
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=10&singleEvents=true&orderBy=startTime`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list events: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            items: data.items || []
        };
    }
}
