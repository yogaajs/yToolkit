// Types definition for rate limiting functionality
// ===========================================================

export type RequestWaiting = {
    resolve: () => void;                   // Function to resolve the promise with a release function
    reject: (error: Error) => void;        // Function to reject the promise with an error
};

export type RequestRunning = {
    startedAt: number;              // Timestamp when the request started
    endedAt: number | null;         // Timestamp when the request ended, or null if still running
};

// Class definition for rate limiting functionality
// ===========================================================

/**
 * CallLimiter class that controls the flow of asynchronous requests
 * to prevent exceeding specified rate limits. This class implements a token bucket
 * algorithm with a fixed rate and burst capacity equal to the rate limit.
 */
export class CallLimiter {
    /**
     * Properties related to the rate limit configuration
     */
    private readonly maxRequestsPerSecond: number;                      // Maximum allowed requests per second (never changes)
    private readonly reductionNumber: number;                           // Number of requests to reduce the rate limit by
    private requestsPerSecond: number;                                  // Current rate limit (can be temporarily reduced)
    private reduceLimitTimeout: NodeJS.Timeout | null = null;           // Timer for restoring rate limit
    private reduceLimitTimestamp: number = 0;                           // Timestamp when the rate limit was last reduced

    /**
     * Queue management properties
     */
    private requestsWaiting: Map<string, RequestWaiting> = new Map();   // Queue of pending requests waiting for execution
    private requestsRunning: Map<string, RequestRunning> = new Map();   // Map of currently running requests with their metadata
    private isProcessing = false;                                       // Flag to prevent multiple queue processing loops

    /**
     * Creates a rate limiter that limits to specified requests per second
     * @param maxRequestsPerSecond Maximum number of requests allowed per second (example: 50 calls per second)
     * @param reductionPercentage Percentage of requests to reduce the rate limit (default: 25%, example: 25% = 12.5 calls per second)
     * @throws Error if maxRequestsPerSecond is not positive
     */
    constructor(maxRequestsPerSecond: number, reductionPercentage: number = 25) {
        if (maxRequestsPerSecond <= 0) {
            throw new Error('maxRequestsPerSecond must be > 0');
        }

        // Constants
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        this.reductionNumber = Math.floor(maxRequestsPerSecond * (reductionPercentage / 100));

        // States
        this.requestsPerSecond = maxRequestsPerSecond;
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
            console.warn('Rate limit reduction already within the last second, skipping...');
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
     * @param timeoutMs Timeout in milliseconds for the request to be completed, 0 for no timeout (default)
     * @returns Promise that resolves with a function to call when the request is complete
     * @throws Error if the request times out or if the rate limiter is in an invalid state
     */
    public async requestSlot(timeoutMs: number = 0): Promise<() => void> {
        const timeout = Math.max(0, timeoutMs);
        const uniqueKey = this.generateUniqueKey();

        await new Promise<void>((resolve, reject) => {
            // Add the request to the queue
            this.requestsWaiting.set(uniqueKey, { resolve, reject });
            this.processQueue();

            if (timeout > 0) {
                setTimeout(() => {
                    // Request not running
                    if (this.requestsRunning.has(uniqueKey) === false) {
                        this.requestsWaiting.delete(uniqueKey);
                        reject(new Error(`${uniqueKey} request timeout`));
                    }
                }, timeout);
            }
        });

        return () => {
            const request = this.requestsRunning.get(uniqueKey);
            if (request) {
                request.endedAt = Date.now();
            }
        };
    }
      
    // Private methods
    
    /**
     * Processes the queue of pending requests according to available rate limit slots
     * Runs as a loop until the queue is empty or no slots are available
     * @throws Error if queue processing fails
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            return; // Prevent multiple concurrent processing loops
        }

        this.isProcessing = true;

        try {
            // Process as many requests as possible in the queue
            while (this.requestsWaiting.size > 0) {

                // Check how many slots are currently available
                let availableSlots = this.getAvailableSlots();

                if (availableSlots === 0) {
                    // No available slots, wait for 100ms before checking again
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }

                // Extract the requests from the queue
                for (let i = 0; i < availableSlots; i++) {
                    const request = this.requestsWaiting2.shift();

                    // No more requests to process
                    if (!request) { break; }

                    request.resolve();  // Start processing the request
                    availableSlots--;   // Decrement the available slots

                    // Add the request to the running requests map
                    this.requestsRunning2.push({ startedAt: Date.now(), endedAt: null });

                    // No more slots available, break the loop
                    if (availableSlots === 0) {
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error in rate limiter queue processing:', error);
        }

        // Reset processing flag
        this.isProcessing = false;
        
        // If new requests were added while we were processing, start again
        if (this.requestsWaiting.size > 0) {
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
        const oneMinuteAgo = now - 60_000;

        // Clean up the running requests
        for (const [key, request] of this.requestsRunning) {
            // Remove completed calls (older than 1 second)
            if (request.endedAt && request.endedAt < oneSecondAgo) {
                this.requestsRunning.delete(key);
                continue;
            }
            // Remove potentially stuck calls (running for more than 1 minute)
            if (request.startedAt && request.startedAt < oneMinuteAgo) {
                console.warn(`Request ${key} has been deleted (timeout)`);
                this.requestsRunning.delete(key);
                continue;
            }
        }
        
        // Calculate available slots based on current rate limit and active calls
        const available = this.requestsPerSecond - this.requestsRunning.size;
        return Math.max(0, available); // Ensure we never return a negative number
    }

    /**
     * Generates a unique key for a request
     * @returns A unique key for a request
     */
    private generateUniqueKey(): string {
        let key: string;

        do {
            // Generate a random key, retry if it's already in use
            key = Math.random().toString(36).slice(2);
        } while (this.requestsWaiting.has(key) || this.requestsRunning.has(key));

        return key;
    }
}
