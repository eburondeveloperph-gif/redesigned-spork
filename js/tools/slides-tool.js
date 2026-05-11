import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Google Slides operations.
 * Allows the agent to manage presentations.
 */
export class SlidesTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Slides API calls.
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
            name: 'slides',
            description: 'Manage Google Slides presentations like creating, reading, and listing presentations',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: create, read, list',
                        enum: ['create', 'read', 'list']
                    },
                    presentationId: {
                        type: 'string',
                        description: 'Presentation ID for read action'
                    },
                    title: {
                        type: 'string',
                        description: 'Presentation title (for create action)'
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Slides operation.
     */
    async execute(args) {
        try {
            const { action, presentationId, title } = args;
            
            if (!this.accessToken) {
                throw new Error('Slides access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'create':
                    return await this.createPresentation(title);
                case 'read':
                    return await this.readPresentation(presentationId);
                case 'list':
                    return await this.listPresentations();
                default:
                    throw new Error(`Unknown Slides action: ${action}`);
            }
        } catch (error) {
            Logger.error('Slides tool execution failed', error);
            throw error;
        }
    }

    /**
     * Creates a new presentation.
     */
    async createPresentation(title) {
        const response = await fetch('https://slides.googleapis.com/v1/presentations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title || 'Untitled Presentation'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create presentation: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.presentationId, url: data.presentationUrl };
    }

    /**
     * Reads a presentation.
     */
    async readPresentation(presentationId) {
        const response = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to read presentation: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.presentationId,
            title: data.title,
            slides: data.slides || []
        };
    }

    /**
     * Lists user's presentations.
     */
    async listPresentations() {
        const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.presentation%22&pageSize=20&fields=files(id,name,createdTime,modifiedTime,webViewLink)', {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list presentations: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            files: data.files || []
        };
    }
}
