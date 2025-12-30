/**
 * 统一云存储客户端
 *
 * 支持多种云存储服务商，通过 CDN_MODE 环境变量自动切换：
 * - r2: Cloudflare R2（S3 兼容）
 * - s3: AWS S3（原生）
 * - aliyun: 阿里云 OSS
 * - qiniu: 七牛云存储
 *
 * @example
 * // 在 .env 中配置
 * CDN_MODE=r2  # 或 s3, aliyun, qiniu
 */

import * as r2Provider from './providers/r2';
import * as aliyunProvider from './providers/aliyun-oss';
import * as qiniuProvider from './providers/qiniu';

// 支持的存储模式
const STORAGE_MODES = {
	r2: r2Provider,
	s3: r2Provider, // S3 和 R2 使用相同的实现（S3 兼容）
	aliyun: aliyunProvider,
	qiniu: qiniuProvider,
};

// 当前存储模式
const CDN_MODE = process.env.CDN_MODE || 'r2';

/**
 * 获取当前存储 Provider
 */
function getProvider() {
	const provider = STORAGE_MODES[CDN_MODE];
	if (!provider) {
		throw new Error(
			`Unsupported CDN_MODE: ${CDN_MODE}. Supported modes: ${Object.keys(STORAGE_MODES).join(', ')}`
		);
	}
	return provider;
}

/**
 * 检查存储配置是否完整
 * @returns {{ configured: boolean, missing?: string[], error?: string, provider?: string }}
 */
export function checkStorageConfig() {
	try {
		const provider = getProvider();
		const result = provider.checkConfig();
		return {
			...result,
			provider: CDN_MODE,
		};
	} catch (error) {
		return {
			configured: false,
			error: error.message,
			provider: CDN_MODE,
		};
	}
}

/**
 * 生成唯一的文件名
 * @param {string} originalName - 原始文件名
 * @param {string} directory - 目录路径
 * @returns {string} 生成的文件路径
 */
export function generateFileKey(originalName, directory = '') {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 10);
	const ext = originalName.split('.').pop()?.toLowerCase() || '';
	const fileName = `${timestamp}-${random}${ext ? `.${ext}` : ''}`;

	// 清理目录路径
	const cleanDir = directory
		.replace(/^\/+|\/+$/g, '') // 移除首尾斜杠
		.replace(/\/+/g, '/'); // 合并多个斜杠

	return cleanDir ? `${cleanDir}/${fileName}` : fileName;
}

/**
 * 获取文件的公开 URL
 * @param {string} key - 文件在存储中的路径
 * @returns {string} 公开访问 URL
 */
export function getPublicUrl(key) {
	const provider = getProvider();
	return provider.getPublicUrl(key);
}

/**
 * 上传文件到云存储
 * @param {Object} options - 上传选项
 * @param {Buffer|Uint8Array} options.body - 文件内容
 * @param {string} options.key - 文件路径
 * @param {string} options.contentType - MIME 类型
 * @param {Object} options.metadata - 元数据（可选）
 * @returns {Promise<{success: boolean, key: string, url: string}>}
 */
export async function uploadToStorage({ body, key, contentType, metadata = {} }) {
	const provider = getProvider();
	return provider.upload({ body, key, contentType, metadata });
}

/**
 * 从云存储删除文件
 * @param {string} key - 文件路径
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteFromStorage(key) {
	const provider = getProvider();
	return provider.deleteFile(key);
}

/**
 * 从云存储获取文件
 * @param {string} key - 文件路径
 * @returns {Promise<{success: boolean, body: ReadableStream, contentType: string}>}
 */
export async function getFromStorage(key) {
	const provider = getProvider();
	return provider.getFile(key);
}

/**
 * 获取存储配置信息（用于调试）
 */
export function getStorageConfig() {
	const provider = getProvider();
	return {
		mode: CDN_MODE,
		...provider.getConfig(),
	};
}

/**
 * 获取当前存储模式
 */
export function getStorageMode() {
	return CDN_MODE;
}

/**
 * 获取支持的存储模式列表
 */
export function getSupportedModes() {
	return Object.keys(STORAGE_MODES);
}

