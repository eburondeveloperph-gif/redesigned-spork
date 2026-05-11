import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for Gmail operations.
 * Allows the agent to read and send emails through Gmail API.
 */
export class GmailTool {
    constructor() {
        this.accessToken = null;
    }

    /**
     * Sets the OAuth access token for Gmail API calls.
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
            name: 'gmail',
            description: 'Perform Gmail operations like reading emails, sending emails, and searching emails',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'The action to perform: read, send, search, list',
                        enum: ['read', 'send', 'search', 'list']
                    },
                    query: {
                        type: 'string',
                        description: 'Search query for emails (for search action) or email ID (for read action)'
                    },
                    to: {
                        type: 'string',
                        description: 'Recipient email address (for send action)'
                    },
                    subject: {
                        type: 'string',
                        description: 'Email subject (for send action)'
                    },
                    body: {
                        type: 'string',
                        description: 'Email body content (for send action)'
                    }
                },
                required: ['action']
            }
        };
    }

    /**
     * Executes the Gmail operation.
     */
    async execute(args) {
        try {
            const { action, query, to, subject, body } = args;
            
            if (!this.accessToken) {
                throw new Error('Gmail access token not set. Please authenticate with Google.');
            }

            switch (action) {
                case 'read':
                    return await this.readEmail(query);
                case 'send':
                    return await this.sendEmail(to, subject, body);
                case 'search':
                    return await this.searchEmails(query);
                case 'list':
                    return await this.listEmails();
                default:
                    throw new Error(`Unknown Gmail action: ${action}`);
            }
        } catch (error) {
            Logger.error('Gmail tool execution failed', error);
            throw error;
        }
    }

    /**
     * Reads a specific email by ID.
     */
    async readEmail(emailId) {
        const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to read email: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            id: data.id,
            snippet: data.snippet,
            payload: this.parseEmailPayload(data.payload)
        };
    }

    /**
     * Sends an email.
     */
    async sendEmail(to, subject, body) {
        const emailContent = [
            `To: ${to}`,
            `Subject: ${subject}`,
            '',
            body
        ].join('\r\n');

        const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)));
        
        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'message/rfc822'
            },
            body: encodedEmail
        });
        
        if (!response.ok) {
            throw new Error(`Failed to send email: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, id: data.id };
    }

    /**
     * Searches for emails matching a query.
     */
    async searchEmails(query) {
        const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to search emails: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            resultSizeEstimate: data.resultSizeEstimate,
            messages: data.messages || []
        };
    }

    /**
     * Lists recent emails.
     */
    async listEmails() {
        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10', {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to list emails: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
            resultSizeEstimate: data.resultSizeEstimate,
            messages: data.messages || []
        };
    }

    /**
     * Parses email payload to extract content.
     */
    parseEmailPayload(payload) {
        if (!payload) return '';
        
        if (payload.body && payload.body.data) {
            return this.decodeBase64(payload.body.data);
        }
        
        if (payload.parts) {
            return payload.parts.map(part => this.parseEmailPayload(part)).join('\n');
        }
        
        return '';
    }

    /**
     * Decodes base64 URL encoded string.
     */
    decodeBase64(data) {
        return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
    }
}
