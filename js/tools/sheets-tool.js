import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Google Sheets operations.
 * Allows the agent to manage spreadsheets and their data.
 */
export class SheetsTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Sheets API calls.
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
            name: 'sheets',
            description: 'Manage Google Sheets like creating, reading, updating, and appending data',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: create, read, update, append, list',
                        enum: ['create', 'read', 'update', 'append', 'list']
                    },
                    spreadsheetId: {
                        type: 'string',
                        description: 'Spreadsheet ID for read, update, append actions'
                    },
                    range: {
                        type: 'string',
                        description: 'Cell range (e.g., "Sheet1!A1:D10") for read, update, append actions'
                    },
                    title: {
                        type: 'string',
                        description: 'Spreadsheet title (for create action)'
                    },
                    values: {
                        type: 'array',
                        description: 'Array of values to write (for update, append actions)',
                        items: {
                            type: 'array',
                            items: {
                                type: 'string'
                            }
                        }
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Sheets operation.
     */
    async execute(args) {
        try {
            const { action, spreadsheetId, range, title, values } = args;
            
            if (!this.accessToken) {
                throw new Error('Sheets access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'create':
                    return await this.createSpreadsheet(title);
                case 'read':
                    return await this.readCells(spreadsheetId, range);
                case 'update':
                    return await this.updateCells(spreadsheetId, range, values);
                case 'append':
                    return await this.appendCells(spreadsheetId, range, values);
                case 'list':
                    return await this.listSpreadsheets();
                default:
                    throw new Error(`Unknown Sheets action: ${action}`);
            }
        } catch (error) {
            Logger.error('Sheets tool execution failed', error);
            throw error;
        }
    }

    /**
     * Creates a new spreadsheet.
     */
    async createSpreadsheet(title) {
        const response = await fetch('https://www.googleapis.com/spreadsheets/v4/spreadsheets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    title: title || 'Untitled Spreadsheet'
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create spreadsheet: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.spreadsheetId, url: data.spreadsheetUrl };
    }

    /**
     * Reads cells from a spreadsheet.
     */
    async readCells(spreadsheetId, range) {
        const response = await fetch(`https://www.googleapis.com/spreadsheets/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to read cells: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            range: data.range,
            values: data.values || []
        };
    }

    /**
     * Updates cells in a spreadsheet.
     */
    async updateCells(spreadsheetId, range, values) {
        const response = await fetch(`https://www.googleapis.com/spreadsheets/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: values || [[]]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to update cells: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            updatedRows: data.updatedRows,
            updatedColumns: data.updatedColumns,
            updatedCells: data.updatedCells
        };
    }

    /**
     * Appends values to a spreadsheet.
     */
    async appendCells(spreadsheetId, range, values) {
        const response = await fetch(`https://www.googleapis.com/spreadsheets/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: values || [[]]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to append cells: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            updates: data.updates.updatedRows,
            tableRange: data.updates.tableRange
        };
    }

    /**
     * Lists user's spreadsheets.
     */
    async listSpreadsheets() {
        const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.spreadsheet%22&pageSize=20&fields=files(id,name,createdTime,modifiedTime,webViewLink)', {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list spreadsheets: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            files: data.files || []
        };
    }
}
