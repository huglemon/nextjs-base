/**
 * 上传模块统一导出
 *
 * 支持多种云存储服务商：
 * - r2: Cloudflare R2（S3 兼容）
 * - s3: AWS S3
 * - aliyun: 阿里云 OSS
 * - qiniu: 七牛云存储
 *
 * 通过 CDN_MODE 环境变量切换存储服务商
 */

// 服务端模块（统一存储客户端）
export {
	checkStorageConfig,
	generateFileKey,
	getPublicUrl,
	uploadToStorage,
	deleteFromStorage,
	getFromStorage,
	getStorageConfig,
	getStorageMode,
	getSupportedModes,
} from './storage-client';

// 服务端模块（上传服务）
export { validateFile, uploadFile, uploadFiles, deleteFile, getUserUploads, getUploadTypeConfig } from './upload-service';

// 客户端模块（上传 Hook）
export { uploadSingleFile, uploadMultipleFiles, createCustomRequest, checkUploadService } from './use-upload';

// 向后兼容：导出 R2 别名（已废弃，建议使用统一接口）
export {
	checkStorageConfig as checkR2Config,
	getStorageConfig as getR2Config,
	uploadToStorage as uploadToR2,
	deleteFromStorage as deleteFromR2,
	getFromStorage as getFromR2,
} from './storage-client';
