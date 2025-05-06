// Types definition
// ===========================================================

export type PromiseResult<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
};

// Functions definition
// ===========================================================

/**
 * Creates a new promise with externally accessible resolve and reject functions
 * @returns Object containing the promise and its resolve/reject functions
 */
export function createPromise<T>(): PromiseResult<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}