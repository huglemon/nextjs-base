/**
 * 七牛云存储 Provider
 *
 * 使用七牛云 SDK 进行文件操作
 *
 * 环境变量配置：
 * - QINIU_ACCESS_KEY: 七牛 AccessKey
 * - QINIU_SECRET_KEY: 七牛 SecretKey
 * - QINIU_BUCKET: 存储桶名称
 * - QINIU_PUBLIC_URL: 公开访问域名（CDN 域名或存储空间域名）
 * - QINIU_ZONE: 存储区域（可选，默认自动检测）
 *   - z0: 华东
 *   - z1: 华北
 *   - z2: 华南
 *   - na0: 北美
 *   - as0: 东南亚
 */

import qiniu from 'qiniu';

// 获取配置
function getEnvConfig() {
	return {
		accessKey: process.env.QINIU_ACCESS_KEY,
		secretKey: process.env.QINIU_SECRET_KEY,
		bucket: process.env.QINIU_BUCKET,
		publicUrl: process.env.QINIU_PUBLIC_URL,
		zone: process.env.QINIU_ZONE,
	};
}

/**
 * 检查配置是否完整
 */
export function checkConfig() {
	const config = getEnvConfig();
	const missing = [];

	if (!config.accessKey) missing.push('QINIU_ACCESS_KEY');
	if (!config.secretKey) missing.push('QINIU_SECRET_KEY');
	if (!config.bucket) missing.push('QINIU_BUCKET');
	if (!config.publicUrl) missing.push('QINIU_PUBLIC_URL');

	if (missing.length > 0) {
		return {
			configured: false,
			missing,
			error: `Missing Qiniu configuration: ${missing.join(', ')}`,
		};
	}

	return { configured: true };
}

/**
 * 获取七牛 Zone 配置
 */
function getZone(zoneName) {
	const zones = {
		z0: qiniu.zone.Zone_z0, // 华东
		z1: qiniu.zone.Zone_z1, // 华北
		z2: qiniu.zone.Zone_z2, // 华南
		na0: qiniu.zone.Zone_na0, // 北美
		as0: qiniu.zone.Zone_as0, // 东南亚
	};
	return zones[zoneName] || null;
}

/**
 * 创建上传配置
 */
function createUploadConfig() {
	const config = getEnvConfig();
	const uploadConfig = new qiniu.conf.Config();

	// 设置区域
	if (config.zone) {
		const zone = getZone(config.zone);
		if (zone) {
			uploadConfig.zone = zone;
		}
	}

	return uploadConfig;
}

/**
 * 创建 Mac（认证）对象
 */
function getMac() {
	const config = getEnvConfig();
	return new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
}

/**
 * 生成上传 Token
 */
function getUploadToken(key) {
	const config = getEnvConfig();
	const mac = getMac();

	const putPolicy = new qiniu.rs.PutPolicy({
		scope: key ? `${config.bucket}:${key}` : config.bucket,
		expires: 3600, // 1 小时有效期
	});

	return putPolicy.uploadToken(mac);
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
	
	// 如果没有协议，添加 http://
	if (!/^https?:\/\//.test(normalized)) {
		normalized = 'http://' + normalized.replace(/^\/+/, '');
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
	const baseUrl = normalizeUrl(config.publicUrl);
	return `${baseUrl}/${key}`;
}

/**
 * 上传文件
 */
export async function upload({ body, key, contentType, metadata = {} }) {
	const configResult = checkConfig();
	if (!configResult.configured) {
		throw new Error(configResult.error);
	}

	const uploadConfig = createUploadConfig();
	const formUploader = new qiniu.form_up.FormUploader(uploadConfig);
	const putExtra = new qiniu.form_up.PutExtra();

	// 设置 MIME 类型
	putExtra.mimeType = contentType;

	// 设置自定义元数据（七牛使用 x-qn-meta- 前缀）
	if (Object.keys(metadata).length > 0) {
		putExtra.metadata = {};
		for (const [k, v] of Object.entries(metadata)) {
			if (v !== undefined && v !== null) {
				putExtra.metadata[`x-qn-meta-${k}`] = encodeURIComponent(String(v));
			}
		}
	}

	const uploadToken = getUploadToken(key);

	return new Promise((resolve, reject) => {
		formUploader.put(uploadToken, key, body, putExtra, (err, respBody, respInfo) => {
			if (err) {
				console.error('Qiniu upload error:', err);
				reject(new Error(`Failed to upload file: ${err.message}`));
				return;
			}

			if (respInfo.statusCode !== 200) {
				console.error('Qiniu upload error:', respBody);
				console.error('Upload details:', {
					bucket: getEnvConfig().bucket,
					key,
					statusCode: respInfo.statusCode,
				});

				if (respInfo.statusCode === 401) {
					reject(
						new Error(
							'Qiniu Authentication Failed: Please check your QINIU_ACCESS_KEY and QINIU_SECRET_KEY.'
						)
					);
					return;
				}

				if (respInfo.statusCode === 403) {
					reject(
						new Error(
							'Qiniu Access Denied: Please check your bucket permissions and configuration.'
						)
					);
					return;
				}

				reject(new Error(`Failed to upload file: ${respBody?.error || 'Unknown error'}`));
				return;
			}

			resolve({
				success: true,
				key,
				url: getPublicUrl(key),
				hash: respBody.hash,
			});
		});
	});
}

/**
 * 删除文件
 */
export async function deleteFile(key) {
	const configResult = checkConfig();
	if (!configResult.configured) {
		throw new Error(configResult.error);
	}

	const config = getEnvConfig();
	const mac = getMac();
	const uploadConfig = createUploadConfig();
	const bucketManager = new qiniu.rs.BucketManager(mac, uploadConfig);

	return new Promise((resolve, reject) => {
		bucketManager.delete(config.bucket, key, (err, respBody, respInfo) => {
			if (err) {
				console.error('Qiniu delete error:', err);
				reject(new Error(`Failed to delete file: ${err.message}`));
				return;
			}

			if (respInfo.statusCode !== 200) {
				// 612 表示文件不存在，也算删除成功
				if (respInfo.statusCode === 612) {
					resolve({ success: true });
					return;
				}

				console.error('Qiniu delete error:', respBody);
				reject(new Error(`Failed to delete file: ${respBody?.error || 'Unknown error'}`));
				return;
			}

			resolve({ success: true });
		});
	});
}

/**
 * 获取文件
 */
export async function getFile(key) {
	const configResult = checkConfig();
	if (!configResult.configured) {
		throw new Error(configResult.error);
	}

	// 七牛云获取文件需要通过公开 URL 访问
	// 如果是私有空间，需要生成下载凭证
	const url = getPublicUrl(key);

	try {
		const response = await fetch(url);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error('File not found');
			}
			throw new Error(`Failed to get file: HTTP ${response.status}`);
		}

		return {
			success: true,
			body: await response.arrayBuffer(),
			contentType: response.headers.get('content-type'),
		};
	} catch (error) {
		console.error('Qiniu get error:', error);
		throw error;
	}
}

/**
 * 获取配置信息（用于调试）
 */
export function getConfig() {
	const config = getEnvConfig();
	return {
		provider: 'qiniu',
		bucket: config.bucket,
		publicUrl: config.publicUrl,
		zone: config.zone || 'auto',
		configured: checkConfig().configured,
	};
}

