import { Logger } from '../utils/logger.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { GoogleSearchTool } from './google-search.js';
import { WeatherTool } from './weather-tool.js';
import { GmailTool } from './gmail-tool.js';
import { CalendarTool } from './calendar-tool.js';
import { DriveTool } from './drive-tool.js';
import { SheetsTool } from './sheets-tool.js';
import { SlidesTool } from './slides-tool.js';
import { TasksTool } from './tasks-tool.js';
import { GeolocationTool } from './geolocation-tool.js';
import { DocumentGeneratorTool } from './document-generator-tool.js';
import { PythonExecutionTool } from './python-execution-tool.js';

/**
 * Manages the registration and execution of tools.
 * Tools extend the functionality of the Gemini API.
 */
export class ToolManager {
    constructor() {
        this.tools = new Map();
        this.registerDefaultTools();
    }

    /**
     * Registers the default tools.
     */
    registerDefaultTools() {
        // Public tools (no OAuth required)
        this.registerTool('googleSearch', new GoogleSearchTool());
        this.registerTool('weather', new WeatherTool());
        this.registerTool('geolocation', new GeolocationTool());
        this.registerTool('document_generator', new DocumentGeneratorTool());
        this.registerTool('pythonExecution', new PythonExecutionTool());
        
        // Google Workspace tools (require OAuth)
        this.registerTool('gmail', new GmailTool());
        this.registerTool('calendar', new CalendarTool());
        this.registerTool('drive', new DriveTool());
        this.registerTool('sheets', new SheetsTool());
        this.registerTool('slides', new SlidesTool());
        this.registerTool('tasks', new TasksTool());

        Logger.info('ToolManager initialized with', this.tools.size, 'tools');
    }

    /**
     * Sets the OAuth access token for all Google API tools.
     */
    setGoogleAccessToken(token) {
        const googleTools = ['gmail', 'calendar', 'drive', 'sheets', 'slides', 'tasks'];
        googleTools.forEach(toolName => {
            const tool = this.tools.get(toolName);
            if (tool && typeof tool.setAccessToken === 'function') {
                tool.setAccessToken(token);
            }
        });
        Logger.info('Google access tokens updated');
    }

    /**
     * Registers a new tool.
     */
    registerTool(name, toolInstance) {
        if (this.tools.has(name)) {
            throw new ApplicationError(
                `Tool ${name} is already registered`,
                ErrorCodes.INVALID_STATE
            );
        }
        this.tools.set(name, toolInstance);
        Logger.info(`Tool ${name} registered`);
    }

    /**
     * Returns the tool declarations for all registered tools.
     * Used by the Gemini API to understand available tools.
     */
    getToolDeclarations() {
        const declarations = [];

        this.tools.forEach((tool, name) => {
            if (tool.getDeclaration) {
                const declaration = tool.getDeclaration();
                
                // Normalize to function declaration format
                if (declaration && declaration.name) {
                    // Already in function declaration format
                    declarations.push(declaration);
                } else if (declaration && declaration.googleSearch) {
                    // Wrap in functionDeclarations format
                    declarations.push({
                        functionDeclarations: [declaration.googleSearch]
                    });
                } else if (declaration && declaration.pythonExecution) {
                    // Wrap in functionDeclarations format
                    declarations.push({
                        functionDeclarations: [declaration.pythonExecution]
                    });
                } else if (declaration && declaration.functionDeclarations) {
                    // Already wrapped
                    declarations.push(declaration);
                } else if (declaration && typeof declaration === 'object') {
                    // Try to extract function declarations
                    const keys = Object.keys(declaration);
                    if (keys.length > 0) {
                        declarations.push({ functionDeclarations: [declaration[keys[0]]] });
                    }
                }
            }
        });

        return declarations;
    }

    /**
     * Handles a tool call from the Gemini API.
     */
    async handleToolCall(functionCall) {
        const name = functionCall.name;
        const args = functionCall.args || {};
        const id = functionCall.id;

        Logger.info(`Handling tool call: ${name}`, { args });

        // Map get_weather_on_date to weather tool
        let toolName = name;
        if (name === 'get_weather_on_date') {
            toolName = 'weather';
        }

        const tool = this.tools.get(toolName);

        if (!tool) {
            Logger.error(`Unknown tool: ${name}`);
            return {
                functionResponses: [{
                    id: id,
                    response: {
                        error: {
                            code: 'TOOL_NOT_FOUND',
                            message: `Unknown tool: ${name}`
                        }
                    }
                }]
            };
        }

        try {
            const result = await tool.execute(args);
            Logger.info(`Tool ${name} executed successfully`);

            return {
                functionResponses: [{
                    id: id,
                    response: {
                        result: result
                    }
                }]
            };
        } catch (error) {
            Logger.error(`Tool ${name} execution failed:`, error);
            return {
                functionResponses: [{
                    id: id,
                    response: {
                        error: {
                            code: 'TOOL_EXECUTION_FAILED',
                            message: error.message || 'Tool execution failed'
                        }
                    }
                }]
            };
        }
    }

    /**
     * Get list of registered tool names.
     */
    getToolNames() {
        return Array.from(this.tools.keys());
    }

    /**
     * Check if a tool is registered.
     */
    hasTool(name) {
        return this.tools.has(name);
    }

    /**
     * Get a tool by name.
     */
    getTool(name) {
        return this.tools.get(name);
    }
}
