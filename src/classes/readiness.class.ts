/**
 * Readiness class provides a mechanism to control and check readiness state.
 * It's useful for managing asynchronous initialization processes and ensuring
 * operations only proceed when the system is ready, like a queue waiting to be processed.
 */
export class Readiness {
    /** Tracks whether the system is ready */
    private _isReady: boolean = false;
    /** Promise that resolves when the system becomes ready */
    private _pendingPromise: Promise<void> | null = null;
    /** Function to resolve the pending promise when ready */
    private _pendingResolve: (() => void) | null = null;
    /** Function to reject the pending promise if needed */
    private _pendingReject: ((reason?: any) => void) | null = null;

    // Public methods

    /**
     * Sets the readiness state to "ready" and resolves any pending promises.
     * If already in ready state, this method has no effect.
     */
    public setReady(): void {
        if (this._isReady !== true) {
            this._isReady = true;           // Update the state to "ready"
            if (this._pendingResolve) {
                this._pendingResolve();     // Resolve the current promise
            }
            this._pendingPromise = null;    // Clear the promise
            this._pendingResolve = null;    // Clear the resolve function
            this._pendingReject = null;     // Clear the reject function
        }
    }

    /**
     * Sets the readiness state to "not ready".
     * If already in not-ready state, this method has no effect.
     * This resets any pending promises, requiring callers to wait again.
     * 
     * @param rejectPending Whether to reject pending promises (default: false)
     */
    public setNotReady(rejectPending: boolean = false): void {
        if (this._isReady !== false) {
            this._isReady = false;          // Update the state to "not ready"
            if (rejectPending) {
                this._pendingReject?.();    // Reject the current promise
            }
            this._pendingPromise = null;    // Clear the promise
            this._pendingResolve = null;    // Clear the resolve function
            this._pendingReject = null;     // Clear the reject function
        }
    }

    /**
     * Checks if the system is ready.
     * If ready, resolves immediately.
     * If not ready, returns a promise that will resolve when ready state is achieved.
     * 
     * @returns A promise that resolves when the system is ready
     */
    public isReady(): Promise<void> {
        if (this._isReady === true) {
            return Promise.resolve();       // Immediately resolve if "ready"
        }
        if (!this._pendingPromise) {
            this._pendingPromise = new Promise<void>((resolve, reject) => {
                this._pendingResolve = resolve;
                this._pendingReject = reject;
            });
        }
        return this._pendingPromise;
    }
}
