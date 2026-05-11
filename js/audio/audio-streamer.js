import { registeredWorklets } from '../core/worklet-registry.js';

/**
 * AudioStreamer - Manages audio playback with queuing and scheduling.
 */
export class AudioStreamer {
    constructor(context) {
        this.context = context;
        this.audioQueue = [];
        this.isPlaying = false;
        this._sampleRate = 24000;
        this.bufferSize = 7680;
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0;
        this.gainNode = this.context.createGain();
        this.isStreamComplete = false;
        this.checkInterval = null;
        this.initialBufferTime = 0.02;
        this.endOfQueueAudioSource = null;
        this.onComplete = () => {};
        this.isInitialized = false;
        this.gainNode.connect(this.context.destination);
        this.addPCM16 = this.addPCM16.bind(this);
    }

    get sampleRate() {
        return this._sampleRate;
    }

    set sampleRate(value) {
        this._sampleRate = value;
        this.bufferSize = Math.floor(value * 0.1); // 100ms buffer
    }

    async initialize() {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
        this.isInitialized = true;
        return this;
    }

    /**
     * Add PCM16 audio data to the playback queue.
     * Handles Uint8Array (raw bytes), Int16Array (PCM16), and ArrayBuffer.
     */
    addPCM16(chunk) {
        if (!this.isInitialized) {
            console.warn('AudioStreamer not initialized. Call initialize() first.');
            return;
        }

        // Convert to Int16Array
        let int16Array;
        
        if (chunk instanceof Int16Array) {
            int16Array = chunk;
        } else if (chunk instanceof Uint8Array) {
            // Uint8Array from ArrayBuffer - interpret as raw PCM16 bytes
            // Each pair of bytes is one Int16 sample
            const length = Math.floor(chunk.length / 2);
            int16Array = new Int16Array(length);
            const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            for (let i = 0; i < length; i++) {
                int16Array[i] = view.getInt16(i * 2, true);
            }
        } else if (chunk instanceof ArrayBuffer) {
            const uint8 = new Uint8Array(chunk);
            const length = Math.floor(uint8.length / 2);
            int16Array = new Int16Array(length);
            const view = new DataView(chunk);
            for (let i = 0; i < length; i++) {
                int16Array[i] = view.getInt16(i * 2, true);
            }
        } else if (chunk.buffer instanceof ArrayBuffer) {
            // Might be typed array with buffer
            const uint8 = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            const length = Math.floor(uint8.length / 2);
            int16Array = new Int16Array(length);
            const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            for (let i = 0; i < length; i++) {
                int16Array[i] = view.getInt16(i * 2, true);
            }
        } else {
            console.error('Invalid audio chunk type:', typeof chunk);
            return;
        }

        // Convert Int16 to Float32
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
        }

        // Add to processing buffer
        if (this.processingBuffer.length === 0) {
            this.processingBuffer = float32Array;
        } else {
            const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
            newBuffer.set(this.processingBuffer);
            newBuffer.set(float32Array, this.processingBuffer.length);
            this.processingBuffer = newBuffer;
        }

        // Queue chunks when we have enough data
        while (this.processingBuffer.length >= this.bufferSize) {
            const buffer = this.processingBuffer.slice(0, this.bufferSize);
            this.audioQueue.push(buffer);
            this.processingBuffer = this.processingBuffer.slice(this.bufferSize);
        }

        // Start playback if not already playing and we have data
        if (!this.isPlaying && this.audioQueue.length > 0) {
            this.isPlaying = true;
            this.scheduledTime = this.context.currentTime + this.initialBufferTime;
            this.scheduleNextBuffer();
        }
    }

    createAudioBuffer(audioData) {
        const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(audioData);
        return audioBuffer;
    }

    scheduleNextBuffer() {
        if (!this.isPlaying) return;

        const SCHEDULE_AHEAD_TIME = 0.2;

        while (this.audioQueue.length > 0 && this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME) {
            const audioData = this.audioQueue.shift();
            const audioBuffer = this.createAudioBuffer(audioData);
            const source = this.context.createBufferSource();

            if (this.audioQueue.length === 0) {
                if (this.endOfQueueAudioSource) {
                    this.endOfQueueAudioSource.onended = null;
                }
                this.endOfQueueAudioSource = source;
                source.onended = () => {
                    if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
                        this.endOfQueueAudioSource = null;
                        this.onComplete();
                    }
                };
            }

            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            // Connect worklets if any
            const worklets = registeredWorklets.get(this.context);
            if (worklets) {
                Object.entries(worklets).forEach(([workletName, graph]) => {
                    const { node, handlers } = graph;
                    if (node) {
                        source.connect(node);
                        node.connect(this.context.destination);
                    }
                });
            }

            const startTime = Math.max(this.scheduledTime, this.context.currentTime);
            source.start(startTime);
            this.scheduledTime = startTime + audioBuffer.duration;
        }

        // Schedule next check
        if (this.audioQueue.length === 0 && this.processingBuffer.length === 0) {
            if (this.isStreamComplete) {
                this.isPlaying = false;
            } else if (!this.checkInterval) {
                this.checkInterval = window.setInterval(() => {
                    if (this.audioQueue.length > 0 || this.processingBuffer.length >= this.bufferSize) {
                        this.scheduleNextBuffer();
                    }
                }, 50);
            }
        } else {
            setTimeout(() => this.scheduleNextBuffer(), 20);
        }
    }

    stop() {
        this.isPlaying = false;
        this.isStreamComplete = true;
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.1);

        setTimeout(() => {
            this.gainNode.disconnect();
            this.gainNode = this.context.createGain();
            this.gainNode.connect(this.context.destination);
        }, 200);
    }

    resume() {
        if (this.context.state === 'suspended') {
            return this.context.resume();
        }
        this.isStreamComplete = false;
        this.scheduledTime = this.context.currentTime + this.initialBufferTime;
        this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
        return Promise.resolve();
    }

    complete() {
        this.isStreamComplete = true;
        if (this.processingBuffer.length > 0) {
            this.audioQueue.push(this.processingBuffer);
            this.processingBuffer = new Float32Array(0);
            if (this.isPlaying) {
                this.scheduleNextBuffer();
            }
        } else {
            this.onComplete();
        }
    }
}
