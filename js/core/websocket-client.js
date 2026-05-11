import { EventEmitter } from 'https://cdn.skypack.dev/eventemitter3';
import { blobToJSON, base64ToArrayBuffer } from '../utils/utils.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';
import { ToolManager } from '../tools/tool-manager.js';

/**
 * Client for interacting with the Gemini 2.0 Flash Multimodal Live API via WebSockets.
 */
export class MultimodalLiveClient extends EventEmitter {
    constructor({ url, apiKey, baseUrl, apiVersion }) {
        super();
        const resolvedBaseUrl = baseUrl || "wss://generativelanguage.googleapis.com/ws";
        const resolvedApiVersion = apiVersion || "v1beta";
        this.url = url || (apiKey
            ? `${resolvedBaseUrl}/google.ai.generativelanguage.${resolvedApiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`
            : null);
        this.ws = null;
        this.config = null;
        this.toolManager = new ToolManager();
        this.connected = false;
        this.audioCount = 0;
        this.lastAudioTime = 0;
        
        // Bind methods for event handlers
        this._onMessage = this._onMessage.bind(this);
    }

    log(type, message) {
        this.emit('log', { date: new Date(), type, message });
    }

    setGoogleAccessToken(token) {
        this.toolManager.setGoogleAccessToken(token);
    }

    connect(config) {
        return new Promise((resolve, reject) => {
            if (!this.url) {
                reject(new ApplicationError(
                    'Gemini API key missing. Set BEATRICE_GEMINI_API_KEY in the runtime env.',
                    ErrorCodes.API_AUTHENTICATION_FAILED
                ));
                return;
            }

            // Get tool declarations
            const defaultTools = config.enableDefaultTools ? this.toolManager.getToolDeclarations() : [];
            const tools = [...defaultTools, ...(config.tools || [])];

            this.config = { ...config };
            if (tools.length > 0) {
                this.config.tools = tools;
            }
            delete this.config.enableDefaultTools;

            Logger.info('Connecting to:', this.url);
            const ws = new WebSocket(this.url);
            this.ws = ws;
            ws.binaryType = 'arraybuffer';

            ws.addEventListener('open', () => {
                this.log('server.open', 'WebSocket connected');
                this.connected = true;
                this._sendDirect({ setup: this.config });
                this.log('client.setup', 'Config sent');
            });

            ws.addEventListener('message', this._onMessage);

            ws.addEventListener('close', (evt) => {
                this.log('server.close', evt.code);
                this.connected = false;
                this.emit('close', evt);
            });

            ws.addEventListener('error', (evt) => {
                this.log('server.error', evt);
                this.emit('error', evt);
            });

            const timeout = setTimeout(() => {
                ws.close();
                reject(new ApplicationError('Connection timeout', ErrorCodes.CONNECTION_FAILED));
            }, 30000);

            ws.addEventListener('open', () => {
                clearTimeout(timeout);
                resolve(true);
            });

            ws.addEventListener('error', () => {
                clearTimeout(timeout);
                reject(new ApplicationError('Connection failed', ErrorCodes.CONNECTION_FAILED));
            });
        });
    }

    disconnect(ws = this.ws) {
        if (ws) {
            try { ws.close(); } catch (e) { Logger.warn('WebSocket close error:', e); }
        }
        this.ws = null;
        this.connected = false;
    }

    _onMessage(evt) {
        const data = evt.data;
        
        // Check if it's binary audio data - handle multiple types
        const isArrayBuffer = data && typeof data !== 'string' && 
                             (data instanceof ArrayBuffer || 
                              (data.constructor && data.constructor.name === 'ArrayBuffer'));
        
        const isBlob = data && typeof Blob !== 'undefined' && data instanceof Blob;
        
        if (isArrayBuffer) {
            // Binary audio data
            this.audioCount++;
            this.log('server.audio', `ArrayBuffer #${this.audioCount} (${data.byteLength} bytes)`);
            this.emit('audio', data);
            return;
        }
        
        if (isBlob) {
            // Blob - need to read as array buffer or text
            data.arrayBuffer().then(buffer => {
                if (buffer.byteLength > 0) {
                    this.audioCount++;
                    this.log('server.audio', `Blob->ArrayBuffer #${this.audioCount} (${buffer.byteLength} bytes)`);
                    this.emit('audio', buffer);
                }
            }).catch(() => {
                // Try reading as text for JSON messages
                data.text().then(text => {
                    this._handleTextMessage(text);
                }).catch(e => {
                    Logger.warn('Could not read blob:', e);
                });
            });
            return;
        }

        // Text message (JSON)
        if (typeof data === 'string') {
            this._handleTextMessage(data);
        }
    }

    _handleTextMessage(text) {
        try {
            const response = JSON.parse(text);
            this.log('server.receive', response);
            
            if (response.error) {
                Logger.error('Server error:', response.error);
                this.emit('error', response.error);
                return;
            }

            if (response.setupComplete) {
                this.log('server.send', 'setupComplete');
                this.emit('setupcomplete');
            }

            if (response.serverContent) {
                this._handleServerContent(response.serverContent);
            }
        } catch (e) {
            Logger.warn('Failed to parse message:', e);
        }
    }

    _handleServerContent(serverContent) {
        // Handle function calls from serverContent.functionCalls
        if (serverContent.functionCalls && serverContent.functionCalls.length > 0) {
            Logger.info('Function calls:', serverContent.functionCalls.length);
            for (const call of serverContent.functionCalls) {
                this._handleToolCall(call);
            }
        }

        // Handle model turn with parts
        if (serverContent.modelTurn) {
            const parts = serverContent.modelTurn.parts || [];
            
            // Extract inline audio data
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/pcm')) {
                    this.audioCount++;
                    this.log('server.audio', `inlineData #${this.audioCount}`);
                    if (part.inlineData.data) {
                        const buffer = base64ToArrayBuffer(part.inlineData.data);
                        this.emit('audio', buffer);
                    }
                }
            }

            // Handle function calls in parts
            const functionCalls = parts.filter(p => p.functionCall);
            if (functionCalls.length > 0) {
                for (const fc of functionCalls) {
                    this._handleToolCall(fc.functionCall);
                }
            }

            // Emit content event
            this.emit('content', { modelTurn: { parts } });
        }

        // Handle transcriptions
        if (serverContent.inputTranscription) {
            this.emit('inputtranscription', serverContent.inputTranscription);
        }
        if (serverContent.outputTranscription) {
            this.emit('outputtranscription', serverContent.outputTranscription);
        }

        // Handle turn complete
        if (serverContent.turnComplete) {
            this.log('server.send', 'turnComplete');
            this.emit('turncomplete');
        }
    }

    _handleToolCall(functionCall) {
        const { name, args, id } = functionCall;
        Logger.info(`Tool: ${name}`, { args });

        this.toolManager.handleToolCall({
            name,
            args: args || {},
            id
        }).then(result => {
            if (result && result.functionResponses) {
                this._sendToolResponse(result.functionResponses[0]);
            }
        }).catch(error => {
            Logger.error('Tool failed:', error);
            this._sendToolResponse({
                id: functionCall.id,
                response: { error: error.message }
            });
        });
    }

    sendRealtimeInput(chunks) {
        if (!this.connected || !this.ws) {
            Logger.warn('Cannot send realtime input');
            return;
        }
        this._sendDirect({ realtimeInput: { mediaChunks: chunks } });
    }

    _sendToolResponse(toolResponse) {
        this._sendDirect({
            toolResponse: {
                id: toolResponse.id,
                response: toolResponse.response || toolResponse
            }
        });
    }

    send(parts, turnComplete = true) {
        parts = Array.isArray(parts) ? parts : [parts];
        
        const formattedParts = parts.map(part => {
            if (typeof part === 'string') {
                return { text: part };
            }
            if (part && typeof part === 'object' && !part.text && !part.inlineData) {
                return { text: JSON.stringify(part) };
            }
            return part;
        });

        this._sendDirect({
            clientContent: { turns: [{ role: 'user', parts: formattedParts }], turnComplete }
        });
    }

    _sendDirect(request) {
        if (!this.ws) throw new Error('WebSocket not connected');
        this.ws.send(JSON.stringify(request));
    }

    isConnected() {
        return this.connected && this.ws?.readyState === WebSocket.OPEN;
    }
}
