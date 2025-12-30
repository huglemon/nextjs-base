/**
 * 阿里云 OSS 存储 Provider
 *
 * 使用阿里云 OSS SDK 进行文件操作
 *
 * 环境变量配置：
 * - ALIYUN_OSS_REGION: OSS 区域（如 oss-cn-hangzhou）
 * - ALIYUN_OSS_ACCESS_KEY_ID: 访问密钥 ID
 * - ALIYUN_OSS_ACCESS_KEY_SECRET: 访问密钥
 * - ALIYUN_OSS_BUCKET: 存储桶名称
 * - ALIYUN_OSS_PUBLIC_URL: 公开访问 URL（可选，默认使用 bucket 域名）
 * - ALIYUN_OSS_INTERNAL: 是否使用内网地址（可选，设为 true 开启）
 */

import OSS from 'ali-oss';

// 获取配置
function getEnvConfig() {
	return {
		region: process.env.ALIYUN_OSS_REGION,
		accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
		accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
		bucket: process.env.ALIYUN_OSS_BUCKET,
		publicUrl: process.env.ALIYUN_OSS_PUBLIC_URL,
		internal: process.env.ALIYUN_OSS_INTERNAL === 'true',
	};
}

/**
 * 检查配置是否完整
 */
export function checkConfig() {
	const config = getEnvConfig();
	const missing = [];

	if (!config.region) missing.push('ALIYUN_OSS_REGION');
	if (!config.accessKeyId) missing.push('ALIYUN_OSS_ACCESS_KEY_ID');
	if (!config.accessKeySecret) missing.push('ALIYUN_OSS_ACCESS_KEY_SECRET');
	if (!config.bucket) missing.push('ALIYUN_OSS_BUCKET');

	if (missing.length > 0) {
		return {
			configured: false,
			missing,
			error: `Missing Aliyun OSS configuration: ${missing.join(', ')}`,
		};
	}

	return { configured: true };
}

/**
 * 创建 OSS 客户端
 */
function createClient() {
	const configResult = checkConfig();
	if (!configResult.configured) {
		throw new Error(configResult.error);
	}

	const config = getEnvConfig();

	return new OSS({
		region: config.region,
		accessKeyId: config.accessKeyId,
		accessKeySecret: config.accessKeySecret,
		bucket: config.bucket,
		internal: config.internal,
	});
}

// 单例模式
let client = null;

/**
 * 获取客户端实例
 */
export function getClient() {
	if (!client) {
		client = createClient();
	}
	return client;
}

/**
 * 规范化 URL，确保协议格式正确
 */
function normalizeUrl(url) {
	if (!url) return '';
	
	// 移除首尾空格
	let normalized = url.trim();
	
	// 修复协议格式（http:/ -> http://，https:/ -> https://）
	normalized = normalized.replace(/^(https?:)\/([^\/])/, '$1//$2');
	
	// 如果没有协议，添加 https://
	if (!/^https?:\/\//.test(normalized)) {
		normalized = 'https://' + normalized.replace(/^\/+/, '');
	}
	
	// 移除末尾斜杠
	normalized = normalized.replace(/\/+$/, '');
	
	return normalized;
}

/**
 * 获取文件的公开 URL
 */
export function getPublicUrl(key) {
	const config = getEnvConfig();

	if (config.publicUrl) {
		const baseUrl = normalizeUrl(config.publicUrl);
		return `${baseUrl}/${key}`;
	}

	// 默认使用 OSS bucket 域名
	const region = config.region;
	const bucket = config.bucket;
	return `https://${bucket}.${region}.aliyuncs.com/${key}`;
}

/**
 * 上传文件
 */
export async function upload({ body, key, contentType, metadata = {} }) {
	const ossClient = getClient();

	// 构建 headers
	const headers = {
		'Content-Type': contentType,
	};

	// 添加自定义元数据（OSS 使用 x-oss-meta- 前缀）
	for (const [k, v] of Object.entries(metadata)) {
		if (v !== undefined && v !== null) {
			headers[`x-oss-meta-${k}`] = encodeURIComponent(String(v));
		}
	}

	try {
		const result = await ossClient.put(key, body, { headers });

		return {
			success: true,
			key,
			url: getPublicUrl(key),
			etag: result.etag,
		};
	} catch (error) {
		console.error('Aliyun OSS upload error:', error);
		console.error('Upload details:', {
			bucket: getEnvConfig().bucket,
			key,
			errorCode: error.code,
			errorMessage: error.message,
		});

		if (error.code === 'AccessDenied') {
			throw new Error(
				'Aliyun OSS Access Denied: Please check your AccessKey permissions and bucket configuration.'
			);
		}

		if (error.code === 'InvalidAccessKeyId') {
			throw new Error('Aliyun OSS Invalid AccessKeyId: Please check your ALIYUN_OSS_ACCESS_KEY_ID.');
		}

		if (error.code === 'SignatureDoesNotMatch') {
			throw new Error(
				'Aliyun OSS Signature Error: Please check your ALIYUN_OSS_ACCESS_KEY_SECRET.'
			);
		}

		throw new Error(`Failed to upload file: ${error.message}`);
	}
}

/**
 * 删除文件
 */
export async function deleteFile(key) {
	const ossClient = getClient();

	try {
		await ossClient.delete(key);
		return { success: true };
	} catch (error) {
		console.error('Aliyun OSS delete error:', error);
		throw new Error(`Failed to delete file: ${error.message}`);
	}
}

/**
 * 获取文件
 */
export async function getFile(key) {
	const ossClient = getClient();

	try {
		const result = await ossClient.get(key);
		return {
			success: true,
			body: result.content,
			contentType: result.res.headers['content-type'],
		};
	} catch (error) {
		console.error('Aliyun OSS get error:', error);

		if (error.code === 'NoSuchKey') {
			throw new Error('File not found');
		}

		throw new Error(`Failed to get file: ${error.message}`);
	}
}

/**
 * 获取配置信息（用于调试）
 */
export function getConfig() {
	const config = getEnvConfig();
	return {
		provider: 'aliyun',
		region: config.region,
		bucket: config.bucket,
		publicUrl: config.publicUrl || `https://${config.bucket}.${config.region}.aliyuncs.com`,
		internal: config.internal,
		configured: checkConfig().configured,
	};
}

