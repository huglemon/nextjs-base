# 云存储配置指南

本项目支持多种云存储服务商，通过 `CDN_MODE` 环境变量一键切换。

## 支持的存储服务

| CDN_MODE | 服务商 | 适用场景 |
|----------|--------|----------|
| `r2` | Cloudflare R2 | 海外用户，S3 兼容 |
| `s3` | AWS S3 | 海外用户，原生 AWS |
| `aliyun` | 阿里云 OSS | 国内用户 |
| `qiniu` | 七牛云存储 | 国内用户 |

## 环境变量配置

### 1. Cloudflare R2（默认）

```env
# 存储模式
CDN_MODE=r2

# R2 配置
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-custom-domain.com
# R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com  # 可选，默认自动生成
```

**获取方式：**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 R2 → 创建存储桶
3. 进入 R2 → 管理 R2 API 令牌 → 创建 API 令牌
4. 选择权限：对象读取和写入
5. 配置自定义域名或使用公开访问域名

---

### 2. AWS S3

```env
# 存储模式
CDN_MODE=s3

# S3 配置
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_aws_access_key_id
S3_SECRET_ACCESS_KEY=your_aws_secret_access_key
S3_BUCKET_NAME=your_bucket_name
S3_PUBLIC_URL=https://your-custom-domain.com  # 可选，默认使用 S3 URL
# S3_ENDPOINT=https://s3.amazonaws.com  # 可选，用于 S3 兼容服务
```

**获取方式：**
1. 登录 [AWS Console](https://console.aws.amazon.com/)
2. 创建 S3 存储桶并配置公开访问
3. 创建 IAM 用户并获取 Access Key
4. 配置 IAM 策略允许 S3 操作

---

### 3. 阿里云 OSS

```env
# 存储模式
CDN_MODE=aliyun

# 阿里云 OSS 配置
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_ACCESS_KEY_ID=your_aliyun_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_aliyun_access_key_secret
ALIYUN_OSS_BUCKET=your_bucket_name
ALIYUN_OSS_PUBLIC_URL=https://your-custom-domain.com  # 可选，默认使用 OSS 域名
# ALIYUN_OSS_INTERNAL=true  # 可选，ECS 内网访问时开启
```

**区域代码：**
- `oss-cn-hangzhou` - 华东1（杭州）
- `oss-cn-shanghai` - 华东2（上海）
- `oss-cn-qingdao` - 华北1（青岛）
- `oss-cn-beijing` - 华北2（北京）
- `oss-cn-shenzhen` - 华南1（深圳）
- `oss-cn-hongkong` - 香港
- 更多区域请参考 [阿里云文档](https://help.aliyun.com/document_detail/31837.html)

**获取方式：**
1. 登录 [阿里云控制台](https://oss.console.aliyun.com/)
2. 创建 Bucket 并配置读写权限
3. 在 RAM 访问控制中创建 AccessKey
4. 配置自定义域名（可选）

---

### 4. 七牛云存储

```env
# 存储模式
CDN_MODE=qiniu

# 七牛云配置
QINIU_ACCESS_KEY=your_qiniu_access_key
QINIU_SECRET_KEY=your_qiniu_secret_key
QINIU_BUCKET=your_bucket_name
QINIU_PUBLIC_URL=https://your-cdn-domain.com
# QINIU_ZONE=z0  # 可选，存储区域（z0:华东 z1:华北 z2:华南 na0:北美 as0:东南亚）
```

**获取方式：**
1. 登录 [七牛云控制台](https://portal.qiniu.com/)
2. 进入对象存储 → 新建空间
3. 在密钥管理中获取 AccessKey/SecretKey
4. 绑定 CDN 加速域名

---

## 使用说明

### 切换存储服务

只需修改 `CDN_MODE` 环境变量即可切换存储服务：

```env
# 切换到阿里云 OSS
CDN_MODE=aliyun
```

所有上传、删除操作会自动使用对应的存储服务，无需修改代码。

### API 接口

上传 API 会自动返回当前使用的存储服务信息：

```bash
GET /api/upload

# 响应
{
  "configured": true,
  "provider": "aliyun",
  "types": { ... }
}
```

### 代码中使用

```javascript
import {
  checkStorageConfig,
  uploadToStorage,
  deleteFromStorage,
  getStorageMode,
} from '@/lib/upload';

// 检查配置
const config = checkStorageConfig();
console.log('当前存储服务:', config.provider);

// 上传文件
const result = await uploadToStorage({
  body: buffer,
  key: 'images/photo.jpg',
  contentType: 'image/jpeg',
});

// 删除文件
await deleteFromStorage('images/photo.jpg');
```

---

## 注意事项

1. **迁移数据**：切换存储服务后，原有文件不会自动迁移，需要手动处理
2. **URL 变化**：切换后文件 URL 会改变，需要更新数据库中的引用
3. **权限配置**：确保存储桶配置了正确的公开读取权限
4. **CORS 配置**：如果前端直传，需要配置存储桶的 CORS 规则

---

## 安装依赖

根据使用的存储服务，需要安装对应的 SDK：

```bash
# R2/S3（默认已安装）
npm install @aws-sdk/client-s3

# 阿里云 OSS
npm install ali-oss

# 七牛云
npm install qiniu
```

