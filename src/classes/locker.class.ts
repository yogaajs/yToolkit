/**
 * Async lock (mutex) for concurrency control.
 * Ensures only one async operation runs in the critical section at a time.
 */
export class Locker {
    private readonly maxQueueLength: number;

    private lock: Promise<void> = Promise.resolve();
    private queue: (() => void)[] = [];

    /**
     * @param maxQueueLength Maximum number of waiters allowed in the queue (default: Infinity)
     */
    constructor(maxQueueLength: number = Infinity) {
        this.maxQueueLength = maxQueueLength;
    }

    /**
     * Acquires the lock, runs the async function, and releases the lock.
     * @param fn The async function to run exclusively.
     * @param timeoutMs Optional timeout in milliseconds to wait for the lock.
     * @returns The result of the function.
     * @throws Error if the lock could not be acquired within the timeout or queue is full.
     */
    public async withLock<T>(fn: () => T | Promise<T>, timeoutMs?: number): Promise<T> {
        await this.acquire(timeoutMs);
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    // Private methods

    /**
     * Internal: Waits until the lock is available, or throws on timeout/queue overflow.
     */
    private acquire(timeoutMs?: number): Promise<void> {
        if (this.queue.length >= this.maxQueueLength) {
            return Promise.reject(new Error('Locker queue limit reached'));
        }
        let timer: NodeJS.Timeout | undefined;
        let release: () => void;
        const next = new Promise<void>((resolve, reject) => {
            release = resolve;
            if (timeoutMs !== undefined) {
                timer = setTimeout(() => {
                    reject(new Error('Locker acquire timeout'));
                }, timeoutMs);
            }
        });
        const prev = this.lock;
        this.lock = next;
        this.queue.push(() => {
            if (timer) clearTimeout(timer);
            release();
        });
        return prev;
    }

    /**
     * Internal: Releases the lock and wakes up the next waiter, if any.
     */
    private release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.lock = Promise.resolve();
        }
    }
}