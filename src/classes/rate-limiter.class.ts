// Types definition for rate limiting functionality
// ===========================================================

export type RequestWaiting = {
    resolve: (value: any) => void;  // Function to resolve the promise with a value
    reject: (error: any) => void;   // Function to reject the promise with an error
};

export type RequestRunning = {
    startedAt: number;              // Timestamp when the request started
    endedAt: number | null;         // Timestamp when the request ended, or null if still running
};

// Class definition for rate limiting functionality
// ===========================================================

/**
 * RateLimiter class that controls the flow of asynchronous requests
 * to prevent exceeding specified rate limits
 */
export class RateLimiter {
    /**
     * Properties related to the rate limit configuration
     */
    private readonly maxRequestsPerSecond: number;                      // Maximum allowed requests per second (never changes)
    private requestsPerSecond: number;                                  // Current rate limit (can be temporarily reduced)
    private temporaryRateLimitTimeout: NodeJS.Timeout | null = null;    // Timer for restoring rate limit

    /**
     * Queue management properties
     */
    private requestsWaiting: Array<RequestWaiting> = [];                // Queue of pending requests waiting for execution
    private requestsRunning: Map<string, RequestRunning> = new Map();   // Map of currently running requests with their metadata
    private isProcessing = false;                                       // Flag to prevent multiple queue processing loops

    /**
     * Creates a rate limiter that limits to specified requests per second
     * @param requestsPerSecond Maximum number of requests allowed per second
     * @throws Error if requestsPerSecond is not positive
     */
    constructor(requestsPerSecond: number) {
        if (requestsPerSecond <= 0) {
            throw new Error('requestsPerSecond must be > 0');
        }
        this.maxRequestsPerSecond = requestsPerSecond;
        this.requestsPerSecond = requestsPerSecond;
    }

    // Public methods

    /**
     * Temporarily reduces the rate limit for a specified period
     * Useful for backing off when API rate limits are being approached
     * @param durationMs Duration in milliseconds of the temporary rate limit reduction
     */
    public async reduceTemporaryRateLimit(durationMs: number): Promise<void> {
        // Clear any existing timeout to prevent conflicts
        if (this.temporaryRateLimitTimeout) {
            clearTimeout(this.temporaryRateLimitTimeout);
        }
        
        // Reduce the rate limit by approximately 25%
        const reductionNumber = Math.floor(this.maxRequestsPerSecond / 4);
        const newRequestsPerSecond = Math.ceil(this.requestsPerSecond - reductionNumber);
        this.requestsPerSecond = Math.max(1, newRequestsPerSecond);

        // Set the timeout to restore the original rate limit after the specified duration
        this.temporaryRateLimitTimeout = setTimeout(() => {
            this.requestsPerSecond = this.maxRequestsPerSecond;
            this.temporaryRateLimitTimeout = null;
        }, durationMs);
    }

    /**
     * Requests a slot for executing an API call within rate limits
     * @returns Promise that resolves with a function to call when the request is complete
     */
    public async requestSlot(): Promise<() => void> {
        return new Promise<() => void>((resolve, reject) => {
            this.requestsWaiting.push({ resolve, reject });
            this.processQueue();
        });
    }
      
    // Private methods
    
    /**
     * Processes the queue of pending requests according to available rate limit slots
     * Runs as a loop until the queue is empty or no slots are available
     */
    private async processQueue() {
        if (this.isProcessing) {
            // Prevent multiple concurrent processing loops
            return;
        }

        this.isProcessing = true;

        // Process as many requests as possible in the queue
        while (this.requestsWaiting.length > 0) {
            try {
                // Check how many slots are currently available
                const availableSlots = this.getAvailableSlots();

                if (availableSlots === 0) {
                    // No available slots, wait for 100ms before checking again
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                
                // Process up to availableSlots requests in a batch
                const batchSize = Math.min(availableSlots, this.requestsWaiting.length);

                // Extract the requests from the queue
                for (let i = 0; i < batchSize; i++) {
                    const request = this.requestsWaiting.shift();
                    
                    if (request) {
                        console.log('slot attributed');
                        const key = Math.random().toString(36);
                        this.requestsRunning.set(key, { startedAt: Date.now(), endedAt: null });

                        // Resolve the request with a function to mark it as ended when called
                        request.resolve(() => {
                            console.log('slot released');
                            this.requestsRunning.get(key)!.endedAt = Date.now()
                        });
                    }
                }

            } catch (error) {
                console.error('Error in rate limiter queue processing:', error);
            }
        }

        // Reset processing flag
        this.isProcessing = false;
            
        // If new requests were added while we were processing, start again
        if (this.requestsWaiting.length > 0) {
            this.processQueue();
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
        const oneMinuteAgo = now - (60 * 1_000);

        // Clean up the running requests map
        for (const [key, request] of this.requestsRunning) {
            // Remove completed calls (older than 1 second)
            if (request.endedAt && request.endedAt < oneSecondAgo) {
                this.requestsRunning.delete(key);
                continue;
            }
            // Remove potentially stuck calls (running for more than 1 minute)
            if (request.startedAt && request.startedAt < oneMinuteAgo) {
                console.warn(`Request ${key} has been running for more than 1 minute but not finished`);
                this.requestsRunning.delete(key);
                continue;
            }
        }
        
        // Calculate available slots based on current rate limit and active calls
        const available = this.requestsPerSecond - this.requestsRunning.size;
        return Math.max(0, available); // Ensure we never return a negative number
    }
}
