// Server-side NB utilities (includes cache support)
import nb from '@/lib/function';
import { cacheManage } from '@/lib/cache/cache-manager';

const serverNb = {
	...nb,
	cacheManage,
	cache: cacheManage(),
};

export default serverNb;
export { cacheManage };
