import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Google Drive operations.
 * Allows the agent to manage files in Google Drive.
 */
export class DriveTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Drive API calls.
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
            name: 'drive',
            description: 'Manage Google Drive files like listing, searching, creating, uploading, and deleting files',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: list, search, create, upload, delete, read',
                        enum: ['list', 'search', 'create', 'upload', 'delete', 'read']
                    },
                    fileId: {
                        type: 'string',
                        description: 'File ID for read, delete actions'
                    },
                    query: {
                        type: 'string',
                        description: 'Search query for files (for search action)'
                    },
                    name: {
                        type: 'string',
                        description: 'File name (for create action)'
                    },
                    mimeType: {
                        type: 'string',
                        description: 'File MIME type (for create action)'
                    },
                    content: {
                        type: 'string',
                        description: 'File content (for create action)'
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Drive operation.
     */
    async execute(args) {
        try {
            const { action, fileId, query, name, mimeType, content } = args;
            
            if (!this.accessToken) {
                throw new Error('Drive access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'list':
                    return await this.listFiles();
                case 'search':
                    return await this.searchFiles(query);
                case 'create':
                    return await this.createFile(name, mimeType, content);
                case 'read':
                    return await this.readFile(fileId);
                case 'delete':
                    return await this.deleteFile(fileId);
                default:
                    throw new Error(`Unknown Drive action: ${action}`);
            }
        } catch (error) {
            Logger.error('Drive tool execution failed', error);
            throw error;
        }
    }

    /**
     * Lists files in Google Drive.
     */
    async listFiles() {
        const response = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime)', {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list files: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            files: data.files || []
        };
    }

    /**
     * Searches for files matching a query.
     */
    async searchFiles(query) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=20&fields=files(id,name,mimeType,createdTime,modifiedTime)`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to search files: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            files: data.files || []
        };
    }

    /**
     * Creates a new file in Google Drive.
     */
    async createFile(name, mimeType, content) {
        const metadata = {
            name: name || 'Untitled',
            mimeType: mimeType || 'text/plain'
        };

        const metadataResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: JSON.stringify(metadata)
        });
        
        if (!metadataResponse.ok) {
            throw new Error(`Failed to create file: ${metadataResponse.statusText}`);
        }
        
        const data = await metadataResponse.json();
        return { success: true, id: data.id, name: data.name };
    }

    /**
     * Reads a file from Google Drive.
     */
    async readFile(fileId) {
        const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!metadataResponse.ok) {
            throw new Error(`Failed to read file metadata: ${metadataResponse.statusText}`);
        }
        
        const metadata = await metadataResponse.json();
        
        // For text files, try to download content
        if (metadata.mimeType.startsWith('text/') || metadata.mimeType === 'application/json') {
            const contentResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (contentResponse.ok) {
                const content = await contentResponse.text();
                return {
                    id: fileId,
                    name: metadata.name,
                    mimeType: metadata.mimeType,
                    content: content
                };
            }
        }
        
        return {
            id: fileId,
            name: metadata.name,
            mimeType: metadata.mimeType
        };
    }

    /**
     * Deletes a file from Google Drive.
     */
    async deleteFile(fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete file: ${response.statusText}`);
        }
        
        return { success: true };
    }
}
