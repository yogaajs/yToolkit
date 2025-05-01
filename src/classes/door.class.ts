/**
 * Door class provides a mechanism to control and check door state (open/closed).
 * It's useful for managing asynchronous initialization processes and ensuring
 * operations only proceed when the door is open, like a queue waiting to be processed.
 */
export class Door {
    /** Tracks whether the door is open */
    private _isOpen: boolean = false;
    /** Tracks the number of waiters currently waiting for the door to open */
    private _waitingCount: number = 0;
    /** Promise that resolves when the door becomes open */
    private _pendingPromise: Promise<void> | null = null;
    /** Function to resolve the pending promise when door opens */
    private _pendingResolve: (() => void) | null = null;
    /** Function to reject the pending promise if needed */
    private _pendingReject: ((reason?: any) => void) | null = null;

    // Public methods

    /**
     * Opens the door and resolves any pending promises.
     * If already open, this method has no effect.
     */
    public open(resolvePending: boolean = true): void {
        if (this._isOpen !== true) {
            this._isOpen = true;            // Update the state to "open"
            if (resolvePending) {
                this._pendingResolve?.();   // Resolve the current promise
            }
            this.reset();
        }
    }

    /**
     * Closes the door.
     * If already closed, this method has no effect.
     * This resets any pending promises, requiring callers to wait again.
     * 
     * @param rejectPending Whether to reject pending promises (default: false)
     */
    public close(rejectPending: boolean = false): void {
        if (this._isOpen !== false) {
            this._isOpen = false;           // Update the state to "closed"
            if (rejectPending) {
                this._pendingReject?.();    // Reject the current promise
            }
            this.reset();
        }
    }

    /**
     * Waits for the door to be open before proceeding.
     * If the door is already open, resolves immediately.
     * If the door is closed, returns a promise that will resolve when the door opens.
     * This allows code to wait at the "door" until it's ready to proceed.
     * 
     * @returns A promise that resolves when the door is open
     */
    public enterOrWait(): Promise<void> {
        if (this._isOpen === true) {
            return Promise.resolve();
        }
        this._waitingCount++;
        if (!this._pendingPromise) {
            this._pendingPromise = new Promise<void>((resolve, reject) => {
                this._pendingResolve = resolve;
                this._pendingReject = reject;
            });
        }
        return this._pendingPromise;
    }

    /**
     * Returns the current state of the door.
     * 
     * @returns true if the door is open, false if it is closed
     */
    public isOpen(): boolean {
        return this._isOpen;
    }
    
    /**
     * Returns the number of callers currently waiting for the door to open.
     * 
     * @returns The number of waiters
     */
    public getWaitingCount(): number {
        return this._waitingCount;
    }

    // Private methods

    /**
     * Resets the door to its initial state.
     * Clears the promise, resolve function, reject function, and waiting count.
     */
    private reset(): void {
        this._pendingPromise = null;    // Clear the promise
        this._pendingResolve = null;    // Clear the resolve function
        this._pendingReject = null;     // Clear the reject function
        this._waitingCount = 0;         // Reset waiting count when door closes
    }
}
