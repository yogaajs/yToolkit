/**
 * In-memory cache with size limitations and automatic expiration
 * Provides efficient storage with automatic cleanup mechanisms
 */
export class Cache {
    /** Stores cache data objects with their calculated memory size */
    private store: Map<string, { data: any; size: number, expireAt: number }> = new Map();

    /** Current size of all cached items in bytes */
    private currentCacheSizeBytes: number = 0;
    
    /** Maximum allowed size of cache in bytes */
    private maxCacheSizeBytes: number;
    
    /** Maximum age of cache items in milliseconds */
    private maxItemAgeMs: number;
  
    /**
     * Creates a new cache instance
     * @param maxCacheSizeMB Maximum cache size in megabytes (default: 10MB)
     * @param maxItemAgeMs Maximum time in milliseconds before items expire (default: 60 seconds)
     */
    constructor(maxCacheSizeMB: number = 10, maxItemAgeSeconds: number = 60) {
        if (maxCacheSizeMB <= 0) {
            throw new Error('Cache size must be greater than 0 MB');
        }
        if (maxItemAgeSeconds <= 0) {
            throw new Error('Cache item age must be greater than 0 seconds');
        }
        
        this.maxCacheSizeBytes = maxCacheSizeMB * 1024 * 1024;
        this.maxItemAgeMs = maxItemAgeSeconds * 1000;
        this.startCleanup();
    }
  
    // Public methods
  
    /**
     * Returns the number of items in the cache
     * @returns The number of items in the cache
     */
    public size(): number {
        return this.store.size;
    }

    /**
     * Returns the current memory usage of the cache
     * @returns The current memory usage of the cache
     */
    public currentMemoryUsage(): number {
        return this.currentCacheSizeBytes;
    }

    /**
     * Adds a value to the cache only if it doesn't already exist
     * @param key Unique identifier for the cached item
     * @param data The value to store (must be serializable)
     * @param ttlSeconds Optional custom TTL in seconds for this specific item
     * @throws Error if the key is invalid or data cannot be serialized
     */
    public add<T>(key: string, data: T, { ttlSeconds }: { ttlSeconds?: number } = {}): void {
        if (!key || typeof key !== 'string') {
            throw new Error('Cache key must be a non-empty string!');
        }
        if (data === undefined || data === null) {
            throw new Error('Data must be non-null!');
        }
        if (this.store.has(key)) {
            throw new Error(`Cache item with key "${key}" already exists!`);
        }

        // Calculate size of data object
        const size = this.calculateSize(data);
            
        // Update size tracking
        this.currentCacheSizeBytes += size;

        // Use custom TTL if provided, otherwise use default
        const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.maxItemAgeMs;
        const expireAt = Date.now() + ttlMs;
    
        this.store.set(key, { data, size, expireAt });
    }
  
    /**
     * Stores or updates a value in the cache
     * @param key Unique identifier for the cached item
     * @param data The value to store (must be serializable)
     * @param ttlSeconds Optional custom TTL in seconds for this specific item
     * @throws Error if the key is invalid or data cannot be serialized
     */
    public set<T>(key: string, data: T, { ttlSeconds }: { ttlSeconds?: number } = {}): void {
        if (!key || typeof key !== 'string') {
            throw new Error('Cache key must be a non-empty string!');
        }
        if (data === undefined || data === null) {
            throw new Error('Data must be non-null!');
        }

        // Calculate size of data object
        const newSize = this.calculateSize(data);
        const oldSize = this.store.get(key)?.size;

        // Update size tracking if key already exists
        if (oldSize) {
            this.currentCacheSizeBytes -= oldSize;
        }
        this.currentCacheSizeBytes += newSize;

        // Use custom TTL if provided, otherwise use default
        const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.maxItemAgeMs;
        const expireAt = Date.now() + ttlMs;
    
        // Update item in cache
        this.store.set(key, { data, size: newSize, expireAt });
    }
  
    /**
     * Retrieves a value from the cache if it exists and hasn't expired
     * @param key The identifier to look up
     * @param resetExpiration Reset the expiration time when accessed, keeping frequently used items in the cache (default: false)
     * @returns The cached value or null if not found or expired
     */
    public get<T>(key: string, resetExpiration: boolean = false): T | null {
        if (!key || typeof key !== 'string') {
            throw new Error('Cache key must be a non-empty string!');
        }

        // Use expiration to find object in cache
        const item = this.store.get(key);
        const now = Date.now();

        // Check if item exists
        if (!item) {
            return null;
        }
        
        // Check if item has expired
        if (now > item.expireAt) {
            this.delete(key);
            return null;
        }

        // Reset expiration if requested (sliding expiration)
        if (resetExpiration) { 
            item.expireAt = now + this.maxItemAgeMs;
        }
        
        return item.data as T;
    }
    
    /**
     * Checks if an item exists in the cache and hasn't expired
     * @param key The identifier to check
     * @returns Boolean indicating if the item exists and is valid
     */
    public has(key: string): boolean {
        const item = this.store.get(key);

        // Check if item exists
        if (item) {
            const isNotExpired = Date.now() < item.expireAt;
            
            // If item has not expired, return true
            if (isNotExpired) {
                return true;
            }

            // If item has expired, reset it and return false
            this.delete(key);
        }

        return false;
    }
  
    /**
     * Removes an item from the cache and updates size tracking
     * @param key The identifier of the item to remove
     * @returns True if the item was found (and removed) and false if not found
     */
    public delete(key: string): boolean {
        const item = this.store.get(key);

        // Check if item exists
        if (item) {
            // Update size tracking
            this.currentCacheSizeBytes -= item.size;

            // Remove item from cache
            this.store.delete(key);
            
            return true;
        }

        return false;
    }
    
    // Private methods
  
    /**
     * Initiates periodic cleanup process
     * Removes expired items and enforces cache size limits
     */
    private startCleanup(): void {
        const cleanup = () => {
            const now = Date.now();
            try {
                let removed = 0;
                const itemsByExpireAt: Record<number, string[]> = {};
                
                // First pass: remove expired items and organize remaining by expiry time
                for (const [key, item] of this.store.entries()) {
                    if (now > item.expireAt) {
                        this.delete(key);
                        removed++;
                    } else {
                        // Group keys by their expiration timestamp
                        if (!itemsByExpireAt[item.expireAt]) {
                            itemsByExpireAt[item.expireAt] = [];
                        }
                        itemsByExpireAt[item.expireAt].push(key);
                    }
                }
                
                // If we're still over the size limit, remove oldest items first
                if (this.currentCacheSizeBytes > this.maxCacheSizeBytes) {

                    // Sort timestamps in ascending order (oldest first)
                    const sortedTimestamps = Object.keys(itemsByExpireAt)
                        .map(Number)
                        .sort((a, b) => a - b);
                    
                    // Remove oldest items until we're under the size limit
                    for (const timestamp of sortedTimestamps) {
                        const keys = itemsByExpireAt[timestamp];
                        for (const key of keys) {
                            if (this.currentCacheSizeBytes <= this.maxCacheSizeBytes) {
                                break;
                            }
                            this.delete(key);
                            removed += keys.length;
                        }
                        
                        if (this.currentCacheSizeBytes <= this.maxCacheSizeBytes) {
                            break;
                        }
                    }
                }

                // Log cleanup results if anything was removed
                if (removed > 0) {
                    console.info(`[Cache] Removed ${removed} items from cache.`);
                }
                
            } catch (err) {
                console.error(`[Cache] Cleanup error:`, err);
            } finally {
                // Schedule next cleanup
                setTimeout(cleanup, 60_000); // run every minute
            }
        };
    
        // Start the cleanup cycle
        cleanup();
    }

    /**
     * Calculates the size of a data object
     * @param data The data object to calculate the size of
     * @returns The size of the data object in bytes
     */
    private calculateSize(data: any): number {
        let size: number;
        try {
            size = Buffer.byteLength(JSON.stringify(data));
        } catch (error) {
            throw new Error(`Failed to serialize data: ${error instanceof Error ? error.message : String(error)}`);
        }
        return size;
    }
}