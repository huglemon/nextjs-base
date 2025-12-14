# Cache 管理 (nb.cache)

支持 PostgreSQL（默认）和 Redis 两种模式，均通过 `nb.cache` 暴露给业务层使用。

## 环境变量

```bash
# db | redis
CACHE_MODE=db

# Redis 仅在 CACHE_MODE=redis 时生效
REDIS_URL=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false
```

> 修改 schema 后别忘了执行 `bunx prisma generate` / `bunx prisma db push` 以创建 `cache_entries` 表。

## 使用示例

```javascript
// 仅服务端使用缓存：请从 "@/lib/nb" 导入
import nb from '@/lib/nb';

// 默认模式取自环境变量
await nb.cache.set('demo:key', { foo: 'bar' }, 60); // TTL 60 秒
const value = await nb.cache.get('demo:key');

// setnx / incr / decr 与原有接口保持一致
await nb.cache.setnx('demo:key', 'v1');
await nb.cache.incr('demo:counter', 120);
await nb.cache.decrby('demo:counter', 2);
await nb.cache.expire('demo:key', 30);
```

> 导入说明：`@/lib/function` 仅包含工具函数（客户端/服务端都可用，不含缓存）；`@/lib/nb` 才包含 `cache`/`cacheManage`，且应只在服务端代码中使用。

## 工厂方法

如需动态切换模式，可使用工厂函数：

```javascript
import { cacheManage } from '@/lib/cache/cache-manager';

const redisCache = cacheManage({ mode: 'redis', redis: { host: 'localhost', port: 6379 } });
await redisCache.set('foo', 'bar');
```
