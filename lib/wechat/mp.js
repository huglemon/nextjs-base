/**
 * 微信公众号 API 工具库
 * 
 * 实现：
 * 1. Access Token 管理（缓存和自动刷新）
 * 2. 带参数二维码生成（临时二维码用于登录）
 * 3. 消息签名验证
 * 4. 扫码事件处理
 */

// 内存缓存 access_token（生产环境建议使用 Redis）
let accessTokenCache = {
	token: null,
	expiresAt: 0,
};

// 扫码结果缓存（sceneId -> { unionid, openid, nickname, avatar, scannedAt }）
const scanResultCache = new Map();

// 缓存清理间隔（30分钟）
const CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000;

// 定期清理过期的扫码结果
if (typeof setInterval !== 'undefined') {
	setInterval(() => {
		const now = Date.now();
		for (const [key, value] of scanResultCache.entries()) {
			// 清理超过 10 分钟的记录
			if (now - value.scannedAt > 10 * 60 * 1000) {
				scanResultCache.delete(key);
			}
		}
	}, CACHE_CLEANUP_INTERVAL);
}

/**
 * 获取微信公众号配置
 * @returns {object} 配置对象
 */
export function getMpConfig() {
	return {
		appId: process.env.WECHAT_MP_APPID,
		appSecret: process.env.WECHAT_MP_SECRET,
		token: process.env.WECHAT_MP_TOKEN,
		encodingAESKey: process.env.WECHAT_MP_ENCODING_AES_KEY,
	};
}

/**
 * 获取 Access Token
 * 自动缓存和刷新
 * @returns {Promise<string>} access_token
 */
export async function getAccessToken() {
	const config = getMpConfig();

	if (!config.appId || !config.appSecret) {
		throw new Error('WeChat MP AppID or Secret not configured');
	}

	// 检查缓存是否有效（提前 5 分钟刷新）
	if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt - 5 * 60 * 1000) {
		return accessTokenCache.token;
	}

	// 请求新的 access_token
	const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.appId}&secret=${config.appSecret}`;

	const response = await fetch(url);
	const data = await response.json();

	if (data.errcode) {
		console.error('[WeChat MP] Get access_token failed:', data);
		throw new Error(`WeChat API Error: ${data.errmsg}`);
	}

	// 更新缓存
	accessTokenCache = {
		token: data.access_token,
		expiresAt: Date.now() + data.expires_in * 1000,
	};

	console.log('[WeChat MP] Access token refreshed, expires in:', data.expires_in, 'seconds');
	return data.access_token;
}

/**
 * 生成带参数的临时二维码
 * 用于扫码登录场景
 * @param {string} sceneId - 场景值（用于标识登录会话）
 * @param {number} [expireSeconds=300] - 过期时间（秒），默认 5 分钟
 * @returns {Promise<{ticket: string, url: string, expire_seconds: number}>}
 */
export async function createTempQrCode(sceneId, expireSeconds = 300) {
	const accessToken = await getAccessToken();

	const url = `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${accessToken}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			expire_seconds: expireSeconds,
			action_name: 'QR_STR_SCENE',
			action_info: {
				scene: {
					scene_str: sceneId,
				},
			},
		}),
	});

	const data = await response.json();

	if (data.errcode) {
		console.error('[WeChat MP] Create QR code failed:', data);
		throw new Error(`WeChat API Error: ${data.errmsg}`);
	}

	return {
		ticket: data.ticket,
		url: data.url,
		expire_seconds: data.expire_seconds,
	};
}

/**
 * 通过 ticket 获取二维码图片 URL
 * @param {string} ticket - 二维码 ticket
 * @returns {string} 二维码图片 URL
 */
export function getQrCodeImageUrl(ticket) {
	return `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * 获取用户信息（需要用户关注公众号）
 * @param {string} openid - 用户 openid
 * @returns {Promise<object>} 用户信息
 */
export async function getUserInfo(openid) {
	const accessToken = await getAccessToken();

	const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;

	const response = await fetch(url);
	const data = await response.json();

	if (data.errcode) {
		console.error('[WeChat MP] Get user info failed:', data);
		throw new Error(`WeChat API Error: ${data.errmsg}`);
	}

	return data;
}

/**
 * 验证微信服务器签名
 * @param {string} signature - 微信签名
 * @param {string} timestamp - 时间戳
 * @param {string} nonce - 随机数
 * @returns {boolean} 是否验证通过
 */
export async function verifySignature(signature, timestamp, nonce) {
	const config = getMpConfig();

	if (!config.token) {
		console.error('[WeChat MP] Token not configured');
		return false;
	}

	// 将 token、timestamp、nonce 三个参数进行字典序排序
	const arr = [config.token, timestamp, nonce].sort();
	const str = arr.join('');

	// 计算 SHA1
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest('SHA-1', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

	return hashHex === signature;
}

/**
 * 解析微信 XML 消息
 * @param {string} xml - XML 字符串
 * @returns {object} 解析后的对象
 */
export function parseXmlMessage(xml) {
	const result = {};

	// 简单的 XML 解析（生产环境建议使用 xml2js 等库）
	const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
	let match;

	while ((match = regex.exec(xml)) !== null) {
		const key = match[1] || match[3];
		const value = match[2] || match[4];
		result[key] = value;
	}

	return result;
}

/**
 * 构建 XML 响应
 * @param {object} data - 响应数据
 * @returns {string} XML 字符串
 */
export function buildXmlResponse(data) {
	const items = Object.entries(data).map(([key, value]) => {
		if (typeof value === 'number') {
			return `<${key}>${value}</${key}>`;
		}
		return `<${key}><![CDATA[${value}]]></${key}>`;
	});

	return `<xml>${items.join('')}</xml>`;
}

/**
 * 保存扫码结果
 * @param {string} sceneId - 场景值
 * @param {object} data - 用户数据
 */
export function saveScanResult(sceneId, data) {
	scanResultCache.set(sceneId, {
		...data,
		scannedAt: Date.now(),
	});
	console.log('[WeChat MP] Scan result saved for scene:', sceneId);
}

/**
 * 获取扫码结果
 * @param {string} sceneId - 场景值
 * @returns {object|null} 用户数据或 null
 */
export function getScanResult(sceneId) {
	const result = scanResultCache.get(sceneId);

	if (!result) {
		return null;
	}

	// 检查是否过期（10 分钟）
	if (Date.now() - result.scannedAt > 10 * 60 * 1000) {
		scanResultCache.delete(sceneId);
		return null;
	}

	return result;
}

/**
 * 删除扫码结果
 * @param {string} sceneId - 场景值
 */
export function deleteScanResult(sceneId) {
	scanResultCache.delete(sceneId);
}

/**
 * 生成唯一的场景值
 * @returns {string} 场景值
 */
export function generateSceneId() {
	return `login_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

