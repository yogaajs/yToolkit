// Types definition
// ===========================================================

export namespace ApiCallDeduplicator {
    export type Options = {
        timeout?: number;
    };
    export type Call<T = any> = {
        promise: Promise<T>;
        resolve: (value: T) => void;
        reject: (reason?: unknown) => void;
    };
}

// Class definition
// ===========================================================

/**
 * CallDeduplicator class that prevents duplicate calls by caching each call
 * for in-flight requests with the same key, allowing efficient reuse of results
 */
export class ApiCallDeduplicator {
    /** Map of active requests indexed by their unique keys */
    private requests = new Map<string, ApiCallDeduplicator.Call>();

    // Public

    /**
     * Creates a key from multiple arguments
     * @param args Array of values to combine into a unique key
     * @returns A string key that uniquely identifies this combination of arguments
     */
    public createKey(...args: (string | number | bigint)[]): string {
        return args.join('_').toLowerCase();
    }

    /**
     * Checks if a request with the given key is currently in progress
     * @param key The unique identifier for the call
     * @returns boolean indicating if the request is in progress
     */
    public isRequestInProgress(key: string): boolean {
        return this.requests.has(key);
    }

    /**
     * Clears all pending requests and rejects them with the given reason
     * @param reason reason for rejection
     */
    public clearAllRequests(reason: string): void {
        if (!reason || typeof reason !== 'string') {
            throw new Error('Invalid reason provided to clearAllRequests method');
        }
        this.requests.forEach((request) => {
            request.reject(new Error(reason));
        });
        this.requests.clear();
    }

    /**
     * Retrieves an existing call by its key if available
     * @param key The unique identifier for the call
     * @param task The function to execute (can be sync or async)
     * @param options Options for the request
     * @param options.timeout Timeout for the request, 0 for no timeout (default)
     * @returns The promise for the call result
     */
    public request<T>(key: string, task: () => T | Promise<T>, options: ApiCallDeduplicator.Options = {}): Promise<T> {
        if (!key || typeof key !== 'string') {
            throw new Error('Invalid key provided to call method');
        }

        if (this.requests.has(key)) {
            return this.requests.get(key)!.promise as Promise<T>;
        }

        const { promise, resolve, reject } = this.createPromise<T>();
        this.requests.set(key, { promise, resolve, reject });

        const clearTimeoutRequest = this.timeoutRequest(key, options.timeout);

        try {
            Promise.resolve(task())
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    clearTimeoutRequest();
                    this.requests.delete(key);
                });
        } catch (err) {
            reject(err);
            clearTimeoutRequest();
            this.requests.delete(key);
        }

        return promise;
    }

    // Private

    /**
     * Creates a new promise with externally accessible resolve and reject functions
     * @returns Object containing the promise and its resolve/reject functions
     */
    private createPromise<T>(): ApiCallDeduplicator.Call<T> {
        let resolve!: (value: T) => void;
        let reject!: (reason?: unknown) => void;

        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        return { promise, resolve, reject };
    }

    /**
     * Creates a timeout for a request
     * @param key The unique identifier for the call
     * @returns The timeout object
     */
    private timeoutRequest(key: string, timeoutMs?: number): () => void {
        if (timeoutMs === undefined || timeoutMs <= 0) {
            return () => {};
        }

        const timeoutId = setTimeout(() => {
            const request = this.requests.get(key);
            if (request) {
                request.reject(new Error('Call timed out'));
                this.requests.delete(key);
            }
        }, timeoutMs);

        return () => clearTimeout(timeoutId);
    }
}
