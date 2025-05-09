/**
 * In-memory cache with size limitations and automatic expiration
 * Provides efficient storage with automatic cleanup mechanisms
 */
export class MemoryCache {
    /** Name of the cache, used for logging */
    private name: string;

    /** Stores cache data objects with their calculated memory size */
    private store: Map<string, { data: any; size: number, expireAt: number }> = new Map();

    /** Current size of all cached items in bytes */
    private currentCacheSizeBytes: number = 0;
    
    /** Maximum allowed size of cache in bytes */
    private maxCacheSizeBytes: number;
    
    /** Maximum age of cache items in milliseconds */
    private maxItemAgeMilliseconds: number;
  
    /**
     * Creates a new cache instance
     * @param options Configuration options
     * @param options.name Name of the cache, used for logging (default: 'Cache')
     * @param options.maxCacheSizeMB Maximum cache size in megabytes (default: 10MB)
     * @param options.maxItemAgeSeconds Maximum time in seconds before items expire (default: 60 seconds)
     */
    constructor(options: { name?: string; maxCacheSizeMB?: number; maxItemAgeSeconds?: number } = {}) {
        const { name = 'Cache', maxCacheSizeMB = 10, maxItemAgeSeconds = 60 } = options;
        
        if (maxCacheSizeMB <= 0) {
            throw new Error('Cache size must be greater than 0 MB');
        }
        if (maxItemAgeSeconds <= 0) {
            throw new Error('Cache item age must be greater than 0 seconds');
        }
        
        this.name = name;
        this.maxCacheSizeBytes = maxCacheSizeMB * 1024 * 1024;
        this.maxItemAgeMilliseconds = maxItemAgeSeconds * 1000;
        this.startCleanup();
    }
  
    // Public methods
  
    /**
     * Returns the number of items in the cache
     * @returns The number of items in the cache
     */
    public currentSize(): number {
        return this.store.size;
    }

    /**
     * Returns the current memory usage of the cache
     * @returns The current memory usage of the cache in megabytes
     */
    public currentUsage(): number {
        return this.currentCacheSizeBytes / 1024 / 1024;
    }

    /**
     * Adds a value to the cache only if it doesn't already exist
     * @param key Unique identifier for the cached item
     * @param data The value to store (must be serializable)
     * @throws Error if the key is invalid or data cannot be serialized
     */
    public add<T>(key: string, data: T): void {
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
        const expireAt = Date.now() + this.maxItemAgeMilliseconds;
    
        // Add item to cache
        const clone = structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data));
        this.store.set(key, { data: clone, size, expireAt });

        // Evict oldest items if cache is over size limit
        this.evictOldestItems();
    }
  
    /**
     * Stores or updates a value in the cache
     * @param key Unique identifier for the cached item
     * @param data The value to store (must be serializable)
     * @param ttlSeconds Optional custom TTL in seconds for this specific item
     * @throws Error if the key is invalid or data cannot be serialized
     */
    public set<T>(key: string, data: T): void {
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
            this.store.delete(key); // delete old item and add new one, for LRU
        }
        this.currentCacheSizeBytes += newSize;

        // Update item in cache
        const expireAt = Date.now() + this.maxItemAgeMilliseconds;
        const clone = structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data));
        this.store.set(key, { data: clone, size: newSize, expireAt });

        // Evict oldest items if cache is over size limit
        this.evictOldestItems();
    }
  
    /**
     * Retrieves a value from the cache if it exists and hasn't expired
     * @param key The identifier to look up
     * @returns The cached value or null if not found or expired
     */
    public get<T>(key: string): T | null {
        if (!key || typeof key !== 'string') {
            throw new Error('Cache key must be a non-empty string!');
        }

        const item = this.store.get(key);

        // Check if item exists
        if (!item) {
            return null;
        }
        
        const now = Date.now();

        // Check if item has expired
        if (now > item.expireAt) {
            this.currentCacheSizeBytes -= item.size;        // Update size tracking     
            this.store.delete(key);                         // Remove item from cache
            return null;
        }

        // Return a clone of the item (avoid mutation of the original object)
        const clone = structuredClone ? structuredClone(item.data) : JSON.parse(JSON.stringify(item.data));

        // Reset expiration if requested (sliding expiration)
        const size = item.size;
        const expireAt = Date.now() + this.maxItemAgeMilliseconds;

        // Update item in cache
        this.store.delete(key);
        this.store.set(key, { data: clone, size, expireAt });

        // Return a clone of the item (avoid mutation of the original object)
        return clone as T;
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
    
                // Since the cache is LRU-ordered, expired items will be at the front.
                for (const [key, item] of this.store.entries()) {
                    if (now > item.expireAt) {
                        this.delete(key);
                        removed++;
                    } else {
                        // Stop at the first non-expired item
                        break;
                    }
                }
    
                // Log cleanup results if anything was removed
                if (removed > 0) {
                    console.info(`[${this.name}] removed ${removed} items from cache.`);
                }
            } catch (err) {
                console.error(`[${this.name}] cleanup error:`, err);
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
            const json = JSON.stringify(data);
            size = Buffer.byteLength(json, 'utf8');
        } catch (error) {
            throw new Error(`Failed to serialize data: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (size > this.maxCacheSizeBytes) {
            throw new Error(`Item size (${size} bytes) exceeds maximum cache size (${this.maxCacheSizeBytes} bytes)`);
        }
        return size;
    }

    /**
     * Evicts oldest items until the cache size is under the maximum allowed size
     */
    private evictOldestItems(): void {  
        let removed = 0;

        while (this.currentCacheSizeBytes > this.maxCacheSizeBytes) {
            // Remove least recently used (first entry)
            const firstEntry = this.store.entries().next();
            if (!firstEntry.done) {
                const [lruKey, item] = firstEntry.value;
                this.currentCacheSizeBytes -= item.size;
                this.store.delete(lruKey);
                removed++;
            } else {
                break;
            }
        }

        // Log cleanup results if anything was removed
        if (removed > 0) {
            console.info(`[${this.name}] removed ${removed} items from cache.`);
        }
    }
}
