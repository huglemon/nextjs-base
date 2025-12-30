/**
 * Cloudflare R2 / AWS S3 存储 Provider
 *
 * 使用 AWS S3 SDK 与 R2/S3 兼容 API 进行交互
 *
 * 环境变量配置（R2 模式）：
 * - R2_ACCOUNT_ID: Cloudflare 账户 ID
 * - R2_ACCESS_KEY_ID: R2 访问密钥 ID
 * - R2_SECRET_ACCESS_KEY: R2 访问密钥
 * - R2_BUCKET_NAME: 存储桶名称
 * - R2_PUBLIC_URL: 公开访问 URL
 * - R2_ENDPOINT: 自定义端点（可选）
 *
 * 环境变量配置（S3 模式）：
 * - S3_REGION: AWS 区域
 * - S3_ACCESS_KEY_ID: AWS 访问密钥 ID
 * - S3_SECRET_ACCESS_KEY: AWS 访问密钥
 * - S3_BUCKET_NAME: 存储桶名称
 * - S3_PUBLIC_URL: 公开访问 URL（或使用默认 S3 URL）
 * - S3_ENDPOINT: 自定义端点（可选，用于 S3 兼容服务）
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// 判断是 R2 还是 S3 模式
const CDN_MODE = process.env.CDN_MODE || 'r2';
const isS3Mode = CDN_MODE === 's3';

// 配置获取
function getEnvConfig() {
	if (isS3Mode) {
		return {
			region: process.env.S3_REGION || 'us-east-1',
			accessKeyId: process.env.S3_ACCESS_KEY_ID,
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
			bucketName: process.env.S3_BUCKET_NAME,
			publicUrl: process.env.S3_PUBLIC_URL,
			endpoint: process.env.S3_ENDPOINT,
		};
	} else {
		return {
			accountId: process.env.R2_ACCOUNT_ID,
			accessKeyId: process.env.R2_ACCESS_KEY_ID,
			secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
			bucketName: process.env.R2_BUCKET_NAME,
			publicUrl: process.env.R2_PUBLIC_URL,
			endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
			region: 'auto',
		};
	}
}

/**
 * 检查配置是否完整
 */
export function checkConfig() {
	const config = getEnvConfig();
	const missing = [];

	if (isS3Mode) {
		if (!config.accessKeyId) missing.push('S3_ACCESS_KEY_ID');
		if (!config.secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');
		if (!config.bucketName) missing.push('S3_BUCKET_NAME');
		// S3 可以使用默认 URL，所以 PUBLIC_URL 不是必须的
	} else {
		if (!config.accountId) missing.push('R2_ACCOUNT_ID');
		if (!config.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
		if (!config.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
		if (!config.bucketName) missing.push('R2_BUCKET_NAME');
		if (!config.publicUrl) missing.push('R2_PUBLIC_URL');
	}

	if (missing.length > 0) {
		return {
			configured: false,
			missing,
			error: `Missing ${isS3Mode ? 'S3' : 'R2'} configuration: ${missing.join(', ')}`,
		};
	}

	return { configured: true };
}

/**
 * 创建 S3 客户端
 */
function createClient() {
	const config = checkConfig();
	if (!config.configured) {
		throw new Error(config.error);
	}

	const envConfig = getEnvConfig();

	const clientConfig = {
		region: envConfig.region,
		credentials: {
			accessKeyId: envConfig.accessKeyId,
			secretAccessKey: envConfig.secretAccessKey,
		},
	};

	// 如果有自定义 endpoint（R2 或 S3 兼容服务）
	if (envConfig.endpoint) {
		clientConfig.endpoint = envConfig.endpoint;
	}

	return new S3Client(clientConfig);
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

	// S3 默认 URL 格式
	if (isS3Mode) {
		return `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${key}`;
	}

	throw new Error('PUBLIC_URL is required for R2 mode');
}

/**
 * 上传文件
 */
export async function upload({ body, key, contentType, metadata = {} }) {
	const s3Client = getClient();
	const config = getEnvConfig();

	// 对 metadata 中的值进行 URL 编码
	const safeMetadata = {};
	for (const [k, v] of Object.entries(metadata)) {
		if (v !== undefined && v !== null) {
			safeMetadata[k] = encodeURIComponent(String(v));
		}
	}

	const command = new PutObjectCommand({
		Bucket: config.bucketName,
		Key: key,
		Body: body,
		ContentType: contentType,
		Metadata: safeMetadata,
	});

	try {
		await s3Client.send(command);
		return {
			success: true,
			key,
			url: getPublicUrl(key),
		};
	} catch (error) {
		console.error(`${isS3Mode ? 'S3' : 'R2'} upload error:`, error);
		console.error('Upload details:', {
			bucket: config.bucketName,
			key,
			endpoint: config.endpoint,
			errorCode: error.Code || error.code,
		});

		if (error.Code === 'AccessDenied' || error.code === 'AccessDenied') {
			throw new Error(
				`${isS3Mode ? 'S3' : 'R2'} Access Denied: Please check your API token permissions and bucket configuration.`
			);
		}

		throw new Error(`Failed to upload file: ${error.message}`);
	}
}

/**
 * 删除文件
 */
export async function deleteFile(key) {
	const s3Client = getClient();
	const config = getEnvConfig();

	const command = new DeleteObjectCommand({
		Bucket: config.bucketName,
		Key: key,
	});

	try {
		await s3Client.send(command);
		return { success: true };
	} catch (error) {
		console.error(`${isS3Mode ? 'S3' : 'R2'} delete error:`, error);
		throw new Error(`Failed to delete file: ${error.message}`);
	}
}

/**
 * 获取文件
 */
export async function getFile(key) {
	const s3Client = getClient();
	const config = getEnvConfig();

	const command = new GetObjectCommand({
		Bucket: config.bucketName,
		Key: key,
	});

	try {
		const response = await s3Client.send(command);
		return {
			success: true,
			body: response.Body,
			contentType: response.ContentType,
		};
	} catch (error) {
		console.error(`${isS3Mode ? 'S3' : 'R2'} get error:`, error);
		throw new Error(`Failed to get file: ${error.message}`);
	}
}

/**
 * 获取配置信息（用于调试）
 */
export function getConfig() {
	const config = getEnvConfig();
	return {
		provider: isS3Mode ? 's3' : 'r2',
		bucketName: config.bucketName,
		publicUrl: config.publicUrl,
		endpoint: config.endpoint,
		region: config.region,
		configured: checkConfig().configured,
	};
}

