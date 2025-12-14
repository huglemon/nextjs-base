import { createClient } from 'redis';
import { prisma } from '@/lib/database/prisma';

const DEFAULT_MODE = process.env.CACHE_MODE || 'db';

function buildExpiresAt(ttlSeconds = 0) {
	return ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000) : null;
}

function isExpired(entry) {
	if (!entry || !entry.expiresAt) return false;
	return entry.expiresAt.getTime() <= Date.now();
}

function toPlainValue(value) {
	if (typeof value === 'string') {
		const num = Number(value);
		if (!Number.isNaN(num)) return num;
	}
	return value;
}

class CacheManager {
	constructor(options = {}) {
		const mode = options.mode || DEFAULT_MODE;
		this.options = options;
		this.cache = mode === 'redis'
			? new RedisCache(options.redis)
			: new PostgresCache();
	}

	get mode() {
		return this.options.mode || DEFAULT_MODE;
	}

	async get(key) {
		return this.cache.get(key);
	}

	async set(key, value, ttlSeconds = 0) {
		return this.cache.set(key, value, ttlSeconds);
	}

	async setnx(key, value, ttlSeconds = 0) {
		return this.cache.setnx(key, value, ttlSeconds);
	}

	async incr(key, ttlSeconds) {
		return this.cache.incr(key, ttlSeconds);
	}

	async incrby(key, step, ttlSeconds) {
		return this.cache.incrby(key, step, ttlSeconds);
	}

	async decrby(key, step) {
		return this.cache.decrby(key, step);
	}

	async del(...keys) {
		return this.cache.del(...keys);
	}

	async delByValue(key, value) {
		return this.cache.delByValue(key, value);
	}

	async clear(prefix) {
		return this.cache.clear(prefix);
	}

	async count(prefix) {
		return this.cache.count(prefix);
	}

	async keys(prefix) {
		return this.cache.keys(prefix);
	}

	async exists(key) {
		return this.cache.exists(key);
	}

	async expire(key, ttlSeconds) {
		return this.cache.expire(key, ttlSeconds);
	}

	async ttl(key) {
		return this.cache.ttl(key);
	}

	async pttl(key) {
		return this.cache.pttl(key);
	}
}

class PostgresCache {
	async get(key) {
		const entry = await this.findFreshEntry(key);
		return entry ? toPlainValue(entry.value) : null;
	}

	async set(key, value, ttlSeconds = 0) {
		const expiresAt = buildExpiresAt(ttlSeconds);
		const existing = await this.findFreshEntry(key);
		const numericValue = typeof value === 'number' ? value : null;

		await prisma.cacheEntry.upsert({
			where: { key },
			create: { key, value, numericValue, expiresAt },
			update: { value, numericValue, expiresAt },
		});

		return {
			code: 0,
			msg: 'ok',
			mode: existing ? 'update' : 'add',
			key,
		};
	}

	async setnx(key, value, ttlSeconds = 0) {
		const existing = await this.findFreshEntry(key);
		if (existing) {
			return { code: -1, msg: 'already exists', key };
		}

		const expiresAt = buildExpiresAt(ttlSeconds);
		const numericValue = typeof value === 'number' ? value : null;

		await prisma.cacheEntry.create({
			data: { key, value, numericValue, expiresAt },
		});

		return { code: 0, msg: 'ok', key };
	}

	async incr(key, ttlSeconds) {
		return this.incrby(key, 1, ttlSeconds);
	}

	async incrby(key, step = 1, ttlSeconds) {
		const expiresAt = buildExpiresAt(ttlSeconds || 0);
		const rows = await prisma.$queryRaw`
			WITH upsert AS (
				INSERT INTO "cache_entries" ("key","value","numeric_value","expires_at","created_at","updated_at")
				VALUES (${key}, to_jsonb(${step}), ${step}, ${expiresAt}, NOW(), NOW())
				ON CONFLICT ("key") DO UPDATE
				SET
					"numeric_value" = CASE
						WHEN "cache_entries"."expires_at" IS NOT NULL AND "cache_entries"."expires_at" <= NOW() THEN EXCLUDED."numeric_value"
						ELSE COALESCE("cache_entries"."numeric_value", 0) + EXCLUDED."numeric_value"
					END,
					"value" = CASE
						WHEN "cache_entries"."expires_at" IS NOT NULL AND "cache_entries"."expires_at" <= NOW() THEN to_jsonb(EXCLUDED."numeric_value")
						ELSE to_jsonb(COALESCE("cache_entries"."numeric_value", 0) + EXCLUDED."numeric_value")
					END,
					"expires_at" = CASE
						WHEN "cache_entries"."expires_at" IS NOT NULL AND "cache_entries"."expires_at" <= NOW() THEN EXCLUDED."expires_at"
						WHEN "cache_entries"."expires_at" IS NULL AND EXCLUDED."expires_at" IS NOT NULL THEN EXCLUDED."expires_at"
						ELSE "cache_entries"."expires_at"
					END,
					"updated_at" = NOW()
				RETURNING "numeric_value","expires_at"
			)
			SELECT "numeric_value","expires_at" FROM upsert;
		`;

		const row = Array.isArray(rows) ? rows[0] : null;
		const value = row?.numeric_value ?? row?.numericValue;
		return typeof value === 'number' ? value : Number(value || 0);
	}

	async decrby(key, step = 1) {
		return this.incrby(key, -1 * step);
	}

	async del(...keys) {
		const keyList = keys.flat().filter(Boolean);
		if (keyList.length === 0) return 0;
		const result = await prisma.cacheEntry.deleteMany({
			where: { key: { in: keyList } },
		});
		return result.count;
	}

	async delByValue(key, value) {
		const entry = await this.findFreshEntry(key);
		if (entry && String(entry.value) === String(value)) {
			return this.del(key);
		}
		return 0;
	}

	async clear(prefix) {
		if (!prefix) return 0;
		const result = await prisma.cacheEntry.deleteMany({
			where: { key: { startsWith: prefix } },
		});
		return result.count;
	}

	async count(prefix = '') {
		return prisma.cacheEntry.count({
			where: prefix ? { key: { startsWith: prefix } } : undefined,
		});
	}

	async keys(prefix = '') {
		const entries = await prisma.cacheEntry.findMany({
			where: prefix ? { key: { startsWith: prefix } } : undefined,
			select: { key: true },
		});
		return entries.map((item) => item.key);
	}

	async exists(key) {
		return prisma.cacheEntry.count({ where: { key } });
	}

	async expire(key, ttlSeconds) {
		const expiresAt = buildExpiresAt(ttlSeconds || 0);
		const entry = await prisma.cacheEntry.updateMany({
			where: { key },
			data: { expiresAt },
		});
		return entry.count;
	}

	async ttl(key) {
		const entry = await this.findFreshEntry(key);
		if (!entry || !entry.expiresAt) return 0;
		const diff = Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000);
		return diff > 0 ? diff : 0;
	}

	async pttl(key) {
		const entry = await this.findFreshEntry(key);
		if (!entry || !entry.expiresAt) return 0;
		const diff = entry.expiresAt.getTime() - Date.now();
		return diff > 0 ? diff : 0;
	}

	async findFreshEntry(key) {
		const entry = await prisma.cacheEntry.findUnique({ where: { key } });
		if (isExpired(entry)) {
			await prisma.cacheEntry.delete({ where: { key } }).catch(() => {});
			return null;
		}
		return entry;
	}
}

class RedisCache {
	constructor(options = {}) {
		this.options = options;
		this.client = null;
		this.clientReady = null;
	}

	async getClient() {
		if (!this.client) {
			const url = this.options.url || buildRedisUrlFromOptions(this.options);
			const socket = {};
			if (this.options.tls === true) {
				socket.tls = true;
			}

			this.client = createClient({
				url,
				database: this.options.db ? Number(this.options.db) : undefined,
				socket: Object.keys(socket).length > 0 ? socket : undefined,
			});

			this.clientReady = this.client.connect().catch((err) => {
				this.client = null;
				this.clientReady = null;
				throw err;
			});
		}

		if (this.clientReady) {
			await this.clientReady;
		}

		return this.client;
	}

	async get(key) {
		const redis = await this.getClient();
		const raw = await redis.get(key);
		if (raw === null) return null;
		try {
			return toPlainValue(JSON.parse(raw));
		} catch (err) {
			return toPlainValue(raw);
		}
	}

	async set(key, value, ttlSeconds = 0) {
		const redis = await this.getClient();
		const exists = await redis.exists(key);
		const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
		const options = ttlSeconds > 0 ? { EX: ttlSeconds } : {};
		const ok = await redis.set(key, payload, options);

		return {
			code: ok === 'OK' ? 0 : -1,
			msg: ok === 'OK' ? 'ok' : 'fail',
			mode: exists ? 'update' : 'add',
			key,
		};
	}

	async setnx(key, value, ttlSeconds = 0) {
		const redis = await this.getClient();
		const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
		const options = { NX: true };
		if (ttlSeconds > 0) options.EX = ttlSeconds;
		const ok = await redis.set(key, payload, options);

		return {
			code: ok === 'OK' ? 0 : -1,
			msg: ok === 'OK' ? 'ok' : 'already exists',
			key,
		};
	}

	async incr(key, ttlSeconds) {
		const redis = await this.getClient();
		const value = await redis.incr(key);
		if (value === 1 && ttlSeconds > 0) {
			await redis.expire(key, ttlSeconds);
		}
		return value;
	}

	async incrby(key, step, ttlSeconds) {
		const redis = await this.getClient();
		const value = await redis.incrBy(key, step);
		if (value === step && ttlSeconds > 0) {
			await redis.expire(key, ttlSeconds);
		}
		return value;
	}

	async decrby(key, step) {
		const redis = await this.getClient();
		return redis.decrBy(key, step);
	}

	async del(...keys) {
		const redis = await this.getClient();
		const keyList = keys.flat().filter(Boolean);
		if (keyList.length === 0) return 0;
		return redis.del(keyList);
	}

	async delByValue(key, value) {
		const current = await this.get(key);
		if (String(current) === String(value)) {
			return this.del(key);
		}
		return 0;
	}

	async clear(prefix) {
		if (!prefix) return 0;
		const redis = await this.getClient();
		const keys = [];
		for await (const key of redis.scanIterator({ MATCH: `${prefix}*` })) {
			keys.push(key);
		}
		return keys.length > 0 ? redis.del(keys) : 0;
	}

	async count(prefix) {
		const redis = await this.getClient();
		let count = 0;
		const match = prefix ? `${prefix}*` : '*';
		for await (const key of redis.scanIterator({ MATCH: match })) {
			if (key) count += 1;
		}
		return count;
	}

	async keys(prefix) {
		const redis = await this.getClient();
		const result = [];
		const match = prefix ? `${prefix}*` : '*';
		for await (const key of redis.scanIterator({ MATCH: match })) {
			result.push(key);
		}
		return result;
	}

	async exists(key) {
		const redis = await this.getClient();
		return redis.exists(key);
	}

	async expire(key, ttlSeconds) {
		const redis = await this.getClient();
		if (ttlSeconds && ttlSeconds > 0) {
			return redis.expire(key, ttlSeconds);
		}
		return redis.persist(key);
	}

	async ttl(key) {
		const redis = await this.getClient();
		const time = await redis.ttl(key);
		return time < 0 ? 0 : time;
	}

	async pttl(key) {
		const redis = await this.getClient();
		const time = await redis.pTTL(key);
		return time < 0 ? 0 : time;
	}
}

function buildRedisUrlFromOptions(options = {}) {
	if (options.url) return options.url;
	const username = options.username || process.env.REDIS_USERNAME;
	const password = options.password || process.env.REDIS_PASSWORD;
	const host = options.host || process.env.REDIS_HOST || '127.0.0.1';
	const port = options.port || process.env.REDIS_PORT || '6379';

	const auth =
		username && password ? `${username}:${password}@` :
		username ? `${username}@` :
		password ? `:${password}@` :
		'';

	return `redis://${auth}${host}:${port}`;
}

export function cacheManage(options = {}) {
	const mode = options.mode || process.env.CACHE_MODE || 'db';
	const redisOptions = {
		url: process.env.REDIS_URL || undefined,
		host: process.env.REDIS_HOST || undefined,
		port: process.env.REDIS_PORT || undefined,
		username: process.env.REDIS_USERNAME || undefined,
		password: process.env.REDIS_PASSWORD || undefined,
		db: process.env.REDIS_DB || undefined,
		tls: process.env.REDIS_TLS === '1' || process.env.REDIS_TLS === 'true',
		...(options.redis || {}),
	};

	return new CacheManager({
		...options,
		mode,
		redis: redisOptions,
	});
}

export { CacheManager, PostgresCache, RedisCache };
