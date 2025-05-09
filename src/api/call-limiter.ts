// Types definition
// ===========================================================

export namespace ApiCallLimiter {
    export type Priority = 'high' | 'normal' | 'low';
    export type Options = {
        requestsPerSecond: number;
    };
    export type RequestWaiting = {
        resolve: () => void;
        reject: (error: Error) => void;
    };
    export type RequestRunning = {
        startedAt: number;
        endedAt: number | null; 
    };
    export type RequestOptions = {
        priority?: Priority;
        timeoutMs?: number;
    };
}

// Class definition
// ===========================================================

/**
 * CallLimiter class that controls the flow of asynchronous requests
 * to prevent exceeding specified rate limits. This class implements a token bucket
 * algorithm with a fixed rate and burst capacity equal to the rate limit.
 */
export class ApiCallLimiter {
    /**
     * Properties related to the rate limit configuration
     */
    private readonly maxRequestsPerSecond: number;
    private readonly reductionNumber: number; 
    private requestsPerSecond: number;
    private reduceLimitTimeout: NodeJS.Timeout | null = null;
    private reduceLimitTimestamp: number = 0;

    /**
     * Queue management properties
     */
    private requestsHigh: Array<ApiCallLimiter.RequestWaiting> = [];
    private requestsNormal: Array<ApiCallLimiter.RequestWaiting> = [];
    private requestsLow: Array<ApiCallLimiter.RequestWaiting> = [];
    private requestsRunning: Set<ApiCallLimiter.RequestRunning> = new Set();
    private isProcessing = false;

    /**
     * Creates a rate limiter that limits to specified requests per second
     * @param requestsPerSecond Maximum number of requests allowed per second (example: 50 calls per second)
     * @throws Error if requestsPerSecond is not positive
     */
    constructor(options: ApiCallLimiter.Options) {
        if (options.requestsPerSecond <= 0) {
            throw new Error('requestsPerSecond must be > 0');
        }

        // Constants
        this.maxRequestsPerSecond = options.requestsPerSecond;
        this.reductionNumber = Math.max(1, Math.floor(options.requestsPerSecond / 10));

        // States
        this.requestsPerSecond = options.requestsPerSecond;
    }

    /**
     * Temporarily reduces the rate limit for a specified period
     * Useful for backing off when API rate limits are being approached
     * @param durationMs Duration in milliseconds of the temporary rate limit reduction
     * @throws Error if durationMs is not positive
     */
    public reduceLimitTemporary(durationMs: number): void {
        if (durationMs <= 0) {
            throw new Error('durationMs must be > 0');
        }

        // If the rate limit was already reduced within the last second, do nothing
        const timeSinceLastReduction = Date.now() - this.reduceLimitTimestamp;
        if (timeSinceLastReduction < 1_000) {
            return;
        }
        this.reduceLimitTimestamp = Date.now();

        // Clear any existing timeout to prevent conflicts
        if (this.reduceLimitTimeout) {
            clearTimeout(this.reduceLimitTimeout);
        }

        // Set the timeout to restore the original rate limit after the specified duration
        this.reduceLimitTimeout = setTimeout(() => {
            this.requestsPerSecond = this.maxRequestsPerSecond;
            this.reduceLimitTimeout = null;
        }, durationMs);

        // Reduce the rate limit
        const newRequestsPerSecond = this.requestsPerSecond - this.reductionNumber;
        this.requestsPerSecond = Math.max(1, newRequestsPerSecond);
    }

    /**
     * Requests a slot for executing an API call within rate limits
     * @param options Options for the request
     * @param options.timeoutMs Timeout in milliseconds for the request to be completed (default: 60_000)
     * @param options.priority Priority of the request, 'high', 'normal', or 'low' (default: 'normal')
     * @returns Promise that resolves with a function to call when the request is complete
     * @throws Error if the request times out or if the rate limiter is in an invalid state
     */
    public async requestSlot(options: ApiCallLimiter.RequestOptions): Promise<() => void> {
        const priority = options.priority || 'normal';
        const timeout = options.timeoutMs ? Math.max(0, options.timeoutMs) : 60_000;

        let timeoutHandle: NodeJS.Timeout | null = null;

        // Add the request to the queue and wait for it to be processed
        await new Promise<void>((resolve, reject) => {
            if (priority === 'high') {
                this.requestsHigh.push({ resolve, reject });
            } else if (priority === 'normal') {
                this.requestsNormal.push({ resolve, reject });
            } else {
                this.requestsLow.push({ resolve, reject });
            }
            this.processQueue();

            // Set the timeout to reject the promise if the request takes too long
            timeoutHandle = setTimeout(() => {
                reject(new Error(`request timeout`));
            }, timeout);
        });

        // Clear the timeout if it exists
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        // Add the request to the running requests array
        const request: ApiCallLimiter.RequestRunning = { startedAt: Date.now(), endedAt: null };
        this.requestsRunning.add(request);

        return () => {
            // Mark the request as completed
            request.endedAt = Date.now();
        };
    }
      
    // Private methods
    
    /**
     * Processes the queue of pending requests according to available rate limit slots
     * Runs as a loop until the queue is empty or no slots are available
     * @throws Error if queue processing fails
     */
    private async processQueue(): Promise<void> {
        // Prevent processing if the queue is empty
        if ((this.requestsHigh.length + this.requestsNormal.length + this.requestsLow.length) === 0) {
            return; 
        }

        // Prevent multiple concurrent processing
        if (this.isProcessing) {
            return; 
        }

        try {
            // Set the processing flag
            this.isProcessing = true;

            // Process as many requests as possible in the queue
            while (this.requestsHigh.length > 0 || this.requestsNormal.length > 0 || this.requestsLow.length > 0) {

                // Check how many slots are currently available
                const availableSlots = this.getAvailableSlots();

                if (availableSlots === 0) {
                    // No available slots, wait for 50ms before checking again
                    await new Promise(resolve => setTimeout(resolve, 50));
                    continue;
                }

                // Get the next request from the queue
                for (let i = 0; i < availableSlots; i++) {
                    // Process requests in priority order: high, then normal, then low
                    const request = this.requestsHigh.shift() || this.requestsNormal.shift() || this.requestsLow.shift();

                    // No more requests to process
                    if (!request) { break; }

                    // Start processing the request
                    request.resolve();
                }
            }

        } finally { 
            // Reset processing flag
            this.isProcessing = false;
            
            // Try to process the queue again (ignored if already processing)
            setImmediate(() => this.processQueue());
        }
    }

    /**
     * Calculates the number of available rate limit slots
     * Also performs cleanup of completed and stuck calls
     * @returns The number of available slots for new requests
     */
    private getAvailableSlots(): number {
        const now = Date.now();
        const oneSecondAgo = now - 1_000;
        const oneMinuteAgo = now - 65_000;  // 1 minute (+5 seconds for the timeout)

        // Clean up the running requests
        for (const request of this.requestsRunning) {
            // Remove completed calls (older than 1 second)
            if (request.endedAt && request.endedAt < oneSecondAgo) {
                this.requestsRunning.delete(request);
                continue;
            }
            // Remove potentially stuck calls (running for more than 1 minute)
            if (request.startedAt && request.startedAt < oneMinuteAgo) {
                this.requestsRunning.delete(request);
                continue;
            }
        }
        
        // Calculate available slots based on current rate limit and active calls
        const available = this.requestsPerSecond - this.requestsRunning.size;
        return Math.max(0, available); // Ensure we never return a negative number
    }
}
