import { Logger } from '../utils/logger.js';

/**
 * Python Execution Tool
 * Executes Python code in a browser-based sandbox using Pyodide.
 */
export class PythonExecutionTool {
    constructor() {
        this.pyodide = null;
        this.isLoaded = false;
        this.loadPromise = null;
    }

    /**
     * Returns the tool declaration for the Gemini API.
     */
    getDeclaration() {
        return {
            name: 'pythonExecution',
            description: 'Execute Python code in a secure browser sandbox. Use this for data analysis, calculations, file processing, and any task requiring Python. Available libraries: pandas, numpy, matplotlib.',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The Python code to execute'
                    }
                },
                required: ['code']
            }
        };
    }

    /**
     * Initialize Pyodide (lazy loading).
     */
    async initialize() {
        if (this.isLoaded && this.pyodide) return;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            try {
                Logger.info('Loading Pyodide...');
                
                if (!window.loadPyodide) {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
                    document.head.appendChild(script);
                    
                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                    });
                }

                this.pyodide = await window.loadPyodide({
                    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
                });

                // Pre-load common packages
                try {
                    await this.pyodide.loadPackage(['pandas', 'numpy', 'matplotlib']);
                } catch (e) {
                    Logger.warn('Some packages failed to load:', e);
                }

                this.isLoaded = true;
                Logger.info('Pyodide loaded successfully');
            } catch (error) {
                Logger.error('Failed to load Pyodide:', error);
                this.loadPromise = null;
                throw error;
            }
        })();

        return this.loadPromise;
    }

    /**
     * Execute Python code.
     */
    async execute(args) {
        try {
            const { code } = args;

            // Initialize Pyodide if needed
            await this.initialize();

            Logger.info('Executing Python code', { codeLength: code.length });

            // Redirect stdout/stderr
            this.pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
            `);

            let result = null;
            let error = null;

            try {
                result = this.pyodide.runPython(code);
                
                const stdout = this.pyodide.runPython('sys.stdout.getvalue()');
                const stderr = this.pyodide.runPython('sys.stderr.getvalue()');

                // Reset stdout/stderr
                this.pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
                `);

                return {
                    success: true,
                    output: stdout || '',
                    error: stderr || '',
                    result: result !== undefined && result !== null ? String(result) : null
                };

            } catch (execError) {
                const stderr = this.pyodide.runPython('sys.stderr.getvalue()');
                const stdout = this.pyodide.runPython('sys.stdout.getvalue()');

                // Reset stdout/stderr
                this.pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
                `);

                return {
                    success: false,
                    output: stdout || '',
                    error: stderr || execError.message,
                    result: null
                };
            }

        } catch (error) {
            Logger.error('Python execution failed:', error);
            return {
                success: false,
                output: '',
                error: error.message,
                result: null
            };
        }
    }
}
