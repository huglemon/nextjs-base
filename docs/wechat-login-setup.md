# 微信扫码登录配置指南

本文档介绍如何配置微信公众号扫码登录功能。

## 更新日志

- **v1.1.0** (2025-12)
  - 使用 `setSessionCookie` 替代手动设置 cookie，更符合 better-auth 规范
  - 添加完整的 OpenAPI 元数据，支持 API 文档生成
  - 添加 hooks 钩子处理登录后逻辑
  - 使用 `mergeSchema` 优化 schema 扩展方式
  - 新增 `unbindWechat` 解绑接口
  - 支持 `onUserCreated` 和 `onSignIn` 回调函数

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

### Q: 为什么获取不到用户的昵称和头像？

⚠️ **重要说明**：自 2021 年 12 月 27 日起，微信调整了接口策略：

- **通过后台接口（全局 `access_token`）获取用户信息时，不再返回昵称和头像等敏感信息**
- 只有在用户通过**网页授权（OAuth2.0）**并明确同意授权的情况下，才能获取这些信息

**当前实现**：
- 扫码登录流程中，我们只能获取到 `openid` 和 `unionid`（如果已绑定开放平台）
- 无法通过后台接口获取用户的昵称和头像
- 这是微信官方的限制，不是代码问题

**解决方案**（可选）：
1. **接受现状**：使用 `openid`/`unionid` 进行登录，昵称和头像留空或使用默认值
2. **使用网页授权**：引导用户进行网页授权流程获取用户信息（会增加用户操作步骤）

> 💡 **建议**：对于扫码登录场景，建议采用方案 1，因为：
> - 用户体验更好（无需额外授权步骤）
> - 登录功能不受影响（使用 openid/unionid 即可完成登录）
> - 如果确实需要用户信息，可以在用户首次登录后引导其完善资料

## 安全建议

1. **保护 AppSecret**: 不要将 AppSecret 提交到代码仓库
2. **使用安全模式**: 生产环境建议启用消息加解密
3. **验证签名**: 所有微信请求都已验证签名，确保来源可信
4. **限制 API 访问**: 考虑添加频率限制，防止滥用

## 插件配置选项

`wechatPlugin` 支持以下配置选项：

```javascript
import { wechatPlugin } from '@/lib/auth/plugins/wechat';

wechatPlugin({
  // 临时邮箱域名（用于微信用户占位邮箱）
  emailDomainName: 'your-domain.com', // 默认: 'wechat.placeholder'

  // 自定义 schema 扩展
  schema: {
    account: {
      fields: {
        // 自定义字段...
      },
    },
  },

  // 用户创建后的回调
  onUserCreated: async ({ user, unionid, openid, ctx }) => {
    console.log('New user created:', user.id);
    // 可以在这里发送欢迎消息、初始化用户数据等
  },

  // 登录成功后的回调
  onSignIn: async ({ user, session, isNewUser, ctx }) => {
    console.log('User signed in:', user.id, 'isNew:', isNewUser);
    // 可以在这里记录登录日志、发送通知等
  },
});
```

## 客户端 API

客户端插件提供以下方法：

```javascript
import { authClient } from '@/lib/auth/auth-client';

// 微信扫码登录
const result = await authClient.signInWechat({
  unionid: 'xxx',
  openid: 'xxx',
  nickname: '用户昵称', // 可选
  avatar: 'https://...', // 可选
});

// 检查微信是否已绑定
const { bound } = await authClient.checkWechatBinding({
  unionid: 'xxx',
});

// 绑定微信到当前账户（需要已登录）
const bindResult = await authClient.bindWechat({
  unionid: 'xxx',
  openid: 'xxx',
});

// 解绑当前账户的微信（需要已登录）
const unbindResult = await authClient.unbindWechat();
```

## 相关文件

- `lib/auth/plugins/wechat/index.js` - Better Auth 服务端插件
- `lib/auth/plugins/wechat/client.js` - Better Auth 客户端插件
- `lib/wechat/mp.js` - 微信公众号 API 工具库
- `app/api/v1/pub/mp/get-qrcode/route.js` - 获取二维码 API
- `app/api/v1/pub/mp/get-scan-result/route.js` - 获取扫码结果 API
- `app/api/v1/pub/mp/webhook/route.js` - 微信消息回调 API
- `components/auth/wechat-login-dialog.js` - 微信登录对话框组件

