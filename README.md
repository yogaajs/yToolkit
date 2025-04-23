# Efficient Core Toolkit

A high-performance, modular Node.js/TypeScript toolkit that includes essential runtime classes for building reliable systems.

## Classes Overview

### `Cache`
> `src/classes/cache.class.ts`

A high-efficiency in-memory cache with support for:

- Size tracking (in bytes)
- TTL (time-to-live) with per-item override
- Sliding expiration (`get()` refreshes TTL)
- Automatic cleanup (removes expired or oldest entries)

**Usage:**
```ts
const cache = new MemoryCache(50, 60); // 50MB max, 60s TTL
cache.set("user:123", { id: 123 });
const user = cache.get("user:123");
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

### `Readiness`
> `src/classes/readiness.class.ts`

Simple async gate used to hold execution until something is ready:

- `setReady()` and `setNotReady()` for state control
- `await isReady()` to wait before running logic

Useful for DBs, queues, connections.

**Usage:**
```ts
await readiness.isReady();
```

## Installation

```bash
npm install @yogaajs/ytoolkit
```

## License
> ⚠️ This package is licensed for personal/internal use only.
> Please contact the author for permission before using it commercially.