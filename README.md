# Efficient Core Toolkit

A high-performance, modular Node.js/TypeScript toolkit that includes essential runtime classes for building reliable systems.

## Classes Overview

### `MemoryCache`
> `src/classes/memory-cache.class.ts`

A high-efficiency in-memory cache with support for:

- Items are automatically evicted when cache exceeds size limit (LRU order)
- Expired items are removed on access or during periodic cleanup
- Deep cloning prevents mutation of cached objects
- Size tracking in bytes with automatic eviction
- Periodic cleanup of expired items

**Usage:**
```ts
// Create cache with 50MB max size and 60s default TTL
const cache = new MemoryCache({ 
    name: "UserCache",
    maxCacheSizeMB: 50,
    maxItemAgeSeconds: 60 
});

// Add item (throws if key exists)
cache.add("user:123", { id: 123 });

// Set/update item
cache.set("user:123", { id: 123, name: "John" });

// Get item (with optional sliding expiration)
const user = cache.get("user:123", true); // true = refresh TTL on access

// Check if item exists
if (cache.has("user:123")) {
    // ...
}

// Remove item
cache.delete("user:123");

// Get cache stats
const size = cache.size();
const memoryUsage = cache.currentMemoryUsage();
```

---

### `Locker`
> `src/classes/locker.class.ts`

A robust async lock (mutex) for concurrency control with support for:

- Ensures only one async operation runs in a critical section at a time
- Prevents race conditions in concurrent environments
- Configurable queue limits and timeouts
- Type-safe implementation

**Usage:**
```ts
const locker = new Locker(100); // Optional: limit to 100 waiters

// Basic usage
await locker.withLock(async () => {
    // critical section - only one operation at a time
    await doSomething();
});

// With timeout
await locker.withLock(async () => {
    // critical section
}, 5000); // 5 seconds timeout

```

---

### `Logger`
> `src/classes/logger.class.ts`

Minimal and colorful structured logger with levels:

- `info`, `debug`, `warn`, `error`
- Optional scoped labels for better tracing
- Supports printing multiple arguments cleanly

**Usage:**
```ts
const logger = new Logger("[MyModule]");
logger.info("Loaded successfully");
```

---

### `Door`
> `src/classes/door.class.ts`

Simple async gate used to control access based on open/closed state:

- `open()` and `close()` for state control
- `await isOpen()` to wait before running logic
- Useful for DBs, queues, connections, and other resources

**Usage:**
```ts
const door = new Door();

const database = db.connect().then(() => {
    door.open();
});

await door.isOpen(); // Wait until door is open
// Execute logic...
```

## Installation

```bash
npm install @yogaajs/ytoolkit
```

## License
> ⚠️ This package is licensed for personal/internal use only.
> Please contact the author for permission before using it commercially.