# 微信扫码登录配置指南

本文档介绍如何配置微信公众号扫码登录功能。

## 前置条件

1. **已认证的微信服务号**（订阅号不支持带参二维码）
2. **公网可访问的服务器**（用于接收微信消息回调）

## 环境变量配置

在 `.env` 或 `.env.local` 文件中添加以下配置：

```bash
# ==========================================
# 微信公众号配置（微信扫码登录）
# ==========================================

# 公众号 AppID（在公众号后台 > 设置与开发 > 基本配置 中获取）
WECHAT_MP_APPID=wx1234567890abcdef

# 公众号 AppSecret（在公众号后台 > 设置与开发 > 基本配置 中获取）
WECHAT_MP_SECRET=your_app_secret_here

# 服务器配置 Token（自定义，用于验证微信服务器）
# 建议使用随机字符串，如：openssl rand -hex 16
WECHAT_MP_TOKEN=your_custom_token_here

# 消息加解密密钥（可选，如果使用安全模式）
# WECHAT_MP_ENCODING_AES_KEY=your_encoding_aes_key_here
```

## 微信公众号后台配置

### 1. 获取 AppID 和 AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **设置与开发** > **基本配置**
3. 记录 **开发者ID(AppID)** 和 **开发者密码(AppSecret)**

> ⚠️ **注意**: AppSecret 只显示一次，请妥善保存。如果忘记，需要重置。

### 2. 配置服务器

1. 在 **设置与开发** > **基本配置** > **服务器配置** 中点击 **修改配置**
2. 填写以下信息：
   - **URL**: `https://your-domain.com/api/v1/pub/mp/webhook`
   - **Token**: 与环境变量 `WECHAT_MP_TOKEN` 一致
   - **EncodingAESKey**: 点击随机生成（可选）
   - **消息加解密方式**: 选择 **明文模式**（开发阶段推荐）或 **安全模式**
3. 点击 **提交**

### 3. 启用服务

1. 确保服务器配置验证通过
2. 点击 **启用** 按钮

### 4. 配置 IP 白名单

1. 在 **设置与开发** > **基本配置** > **IP白名单** 中
2. 添加你服务器的公网 IP 地址

## 开发环境调试

### 使用 ngrok 或类似工具

由于微信服务器需要访问公网地址，本地开发时需要使用内网穿透工具：

```bash
# 安装 ngrok
npm install -g ngrok

# 启动隧道（假设本地运行在 3000 端口）
ngrok http 3000
```

然后使用 ngrok 提供的 HTTPS 地址配置微信后台。

### 调试日志

API 路由中已添加详细的日志输出，可在控制台查看：

- `[WeChat MP] *` - 公众号工具库日志
- `[WeChat Webhook] *` - 消息回调日志
- `[API] *` - API 路由日志

## API 接口说明

### 1. 获取登录二维码

```
GET /api/v1/pub/mp/get-qrcode
```

**响应示例:**

```json
{
  "success": true,
  "data": {
    "sceneId": "login_1702800000000_abc123",
    "qrcodeUrl": "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=xxx",
    "expiresIn": 300
  }
}
```

### 2. 轮询扫码结果

```
GET /api/v1/pub/mp/get-scan-result?sceneId=login_xxx
```

**响应示例（未扫码）:**

```json
{
  "success": true,
  "data": {
    "scanned": false
  }
}
```

**响应示例（已扫码）:**

```json
{
  "success": true,
  "data": {
    "scanned": true,
    "unionid": "o6xxx...",
    "openid": "oGxxx...",
    "nickname": "用户昵称",
    "avatar": "https://..."
  }
}
```

### 3. 微信消息回调

```
GET  /api/v1/pub/mp/webhook  - 服务器验证
POST /api/v1/pub/mp/webhook  - 消息/事件接收
```

## 登录流程说明

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户浏览器  │     │   服务端     │     │  微信服务器  │     │   用户手机   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │                    │
       │  1. 请求二维码       │                    │                    │
       │───────────────────>│                    │                    │
       │                    │  2. 创建临时二维码   │                    │
       │                    │───────────────────>│                    │
       │                    │<───────────────────│                    │
       │  3. 返回二维码URL    │                    │                    │
       │<───────────────────│                    │                    │
       │                    │                    │                    │
       │  4. 轮询扫码结果     │                    │                    │
       │───────────────────>│                    │                    │
       │  (每2秒)            │                    │                    │
       │                    │                    │  5. 用户扫码        │
       │                    │                    │<───────────────────│
       │                    │  6. 推送扫码事件    │                    │
       │                    │<───────────────────│                    │
       │                    │  7. 获取用户信息    │                    │
       │                    │───────────────────>│                    │
       │                    │<───────────────────│                    │
       │  8. 返回扫码成功     │                    │                    │
       │<───────────────────│                    │                    │
       │                    │                    │                    │
       │  9. 调用登录API      │                    │                    │
       │───────────────────>│                    │                    │
       │  10. 创建会话        │                    │                    │
       │<───────────────────│                    │                    │
       │                    │                    │                    │
       │  11. 跳转到目标页面  │                    │                    │
       │                    │                    │                    │
```

## 常见问题

### Q: 二维码生成失败，提示 "WeChat API Error"

检查以下配置：
1. `WECHAT_MP_APPID` 和 `WECHAT_MP_SECRET` 是否正确
2. 服务器 IP 是否已添加到白名单
3. 公众号是否已认证（订阅号不支持带参二维码）

### Q: 服务器配置验证失败

检查以下配置：
1. URL 是否可公网访问（HTTPS）
2. Token 是否与环境变量一致
3. 查看服务器日志是否有收到验证请求

### Q: 扫码后没有收到事件

检查以下配置：
1. 服务器配置是否已启用
2. 是否使用了正确的认证服务号
3. 查看 webhook 日志是否有收到 POST 请求

### Q: 获取不到 unionid

需要满足以下条件之一：
1. 用户已关注公众号
2. 公众号已绑定到微信开放平台

> 💡 **建议**: 将公众号绑定到微信开放平台，这样可以获取 unionid，实现跨应用用户统一。

## 安全建议

1. **保护 AppSecret**: 不要将 AppSecret 提交到代码仓库
2. **使用安全模式**: 生产环境建议启用消息加解密
3. **验证签名**: 所有微信请求都已验证签名，确保来源可信
4. **限制 API 访问**: 考虑添加频率限制，防止滥用

## 相关文件

- `lib/auth/plugins/wechat/index.js` - Better Auth 服务端插件
- `lib/auth/plugins/wechat/client.js` - Better Auth 客户端插件
- `lib/wechat/mp.js` - 微信公众号 API 工具库
- `app/api/v1/pub/mp/get-qrcode/route.js` - 获取二维码 API
- `app/api/v1/pub/mp/get-scan-result/route.js` - 获取扫码结果 API
- `app/api/v1/pub/mp/webhook/route.js` - 微信消息回调 API
- `components/auth/wechat-login-dialog.js` - 微信登录对话框组件

