import { Logger } from '../utils/logger.js';

/**
 * Represents a tool for performing web searches with grounding.
 * Uses SerpAPI or a free alternative for search results.
 */
export class GoogleSearchTool {
    constructor() {
        this.apiKey = null;
    }

    /**
     * Sets the API key for search service.
     */
    setAccessToken(token) {
        this.apiKey = token;
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'googleSearch',
            description: 'Search the web for current information, news, facts, and data. Use this when the user asks about recent events, current information, or needs information that might not be in training data.',
            parameters: {
                type: 'object',
                properties: {
                    searchQuery: {
                        type: 'string',
                        description: 'The search query to search the web for information'
                    }
                },
                required: ['searchQuery']
            }
        };
    }

    /**
     * Execute the search tool.
     */
    async execute(args) {
        try {
            Logger.info('Executing Google Search', args);
            const { searchQuery } = args;

            // Use DuckDuckGo Instant Answer API (free, no key required)
            const response = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1`
            );

            if (!response.ok) {
                throw new Error('Search service unavailable');
            }

            const data = await response.json();

            // Extract relevant results
            const results = [];
            
            if (data.AbstractText) {
                results.push({
                    title: data.Heading || 'Summary',
                    snippet: data.AbstractText,
                    url: data.AbstractURL || ''
                });
            }

            // Add related topics
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                data.RelatedTopics.slice(0, 5).forEach(topic => {
                    if (topic.Text) {
                        results.push({
                            title: topic.Text.substring(0, 100),
                            snippet: topic.Text,
                            url: topic.FirstURL || ''
                        });
                    }
                });
            }

            return {
                success: true,
                query: searchQuery,
                results: results.slice(0, 10),
                summary: data.AbstractText || 'No detailed information available',
                message: `Found ${results.length} results for "${searchQuery}"`
            };

        } catch (error) {
            Logger.error('Google Search failed', error);
            throw error;
        }
    }
}
