/**
 * 微信扫码登录 Better Auth 服务端插件
 *
 * 通过微信公众号带参二维码实现扫码登录
 * 用户扫码后关注公众号或已关注则直接获取 unionid/openid
 *
 * 功能特性：
 * - 扫码登录（新用户自动注册）
 * - 微信绑定检查
 * - 微信账户绑定（已登录用户）
 * - OpenAPI 文档支持
 * - 登录后钩子处理
 */

import {
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
	getSessionFromCtx,
} from 'better-auth/api';
import { setSessionCookie, parseSetCookieHeader } from 'better-auth/cookies';
import { mergeSchema } from 'better-auth/db';
import { z } from 'zod';

/**
 * 生成唯一 ID
 */
function generateId() {
	return crypto.randomUUID();
}

/**
 * 错误码常量
 */
const ERROR_CODES = {
	FAILED_TO_CREATE_USER: 'Failed to create user',
	FAILED_TO_FIND_USER: 'Failed to find user',
	COULD_NOT_CREATE_SESSION: 'Could not create session',
	WECHAT_ALREADY_BOUND: 'WeChat already bound to another account',
	WECHAT_ALREADY_BOUND_SELF: 'Already bound to this account',
	UNAUTHORIZED: 'Unauthorized',
	INTERNAL_ERROR: 'Internal server error',
};

/**
 * 默认 schema 定义
 * 使用 account 表存储微信关联（符合 OAuth 标准）
 */
const defaultSchema = {
	account: {
		fields: {
			// accessToken 字段用于存储 openid，便于后续业务使用
		},
	},
};

/**
 * 微信扫码登录插件
 * @param {object} options - 插件配置选项
 * @param {string} [options.emailDomainName] - 临时邮箱域名，默认使用 wechat.placeholder
 * @param {object} [options.schema] - 自定义 schema 扩展
 * @param {function} [options.onUserCreated] - 用户创建后的回调函数
 * @param {function} [options.onSignIn] - 登录成功后的回调函数
 * @returns {object} Better Auth 插件配置
 */
export const wechatPlugin = (options = {}) => {
	const { emailDomainName = 'wechat.placeholder', onUserCreated, onSignIn } = options;

	return {
		id: 'wechat',

		endpoints: {
			/**
			 * 微信扫码登录接口
			 * 根据 unionid 查找或创建用户，然后创建会话
			 */
			signInWechat: createAuthEndpoint(
				'/sign-in/wechat',
				{
					method: 'POST',
					body: z.object({
						unionid: z.string().min(1, 'unionid is required'),
						openid: z.string().min(1, 'openid is required'),
						nickname: z.string().optional(),
						avatar: z.string().optional(),
					}),
					metadata: {
						openapi: {
							summary: 'Sign in with WeChat',
							description:
								'Authenticate user via WeChat QR code scan. Creates new user if not exists.',
							tags: ['Authentication', 'WeChat'],
							responses: {
								200: {
									description: 'Successfully signed in',
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													success: { type: 'boolean' },
													user: {
														type: 'object',
														properties: {
															id: { type: 'string' },
															name: { type: 'string' },
															email: { type: 'string' },
															image: { type: 'string', nullable: true },
														},
													},
													session: {
														type: 'object',
														properties: {
															token: { type: 'string' },
															expiresAt: { type: 'string', format: 'date-time' },
														},
													},
												},
											},
										},
									},
								},
								500: {
									description: 'Internal server error',
								},
							},
						},
					},
				},
				async (ctx) => {
					const { unionid, openid, nickname, avatar } = ctx.body;

					try {
						// 使用 better-auth adapter 查找现有账户
						const existingAccount = await ctx.context.adapter.findOne({
							model: 'account',
							where: [
								{ field: 'providerId', value: 'wechat' },
								{ field: 'accountId', value: unionid },
							],
						});

						let user;
						let isNewUser = false;

						if (existingAccount) {
							// 已有用户，获取用户信息
							user = await ctx.context.adapter.findOne({
								model: 'user',
								where: [{ field: 'id', value: existingAccount.userId }],
							});

							// 更新用户头像和昵称（如果有新的且当前为空）
							if (user && (nickname || avatar)) {
								const updateData = {};
								if (nickname && !user.name) updateData.name = nickname;
								if (avatar && !user.image) updateData.image = avatar;

								if (Object.keys(updateData).length > 0) {
									user = await ctx.context.adapter.update({
										model: 'user',
										where: [{ field: 'id', value: user.id }],
										update: updateData,
									});
								}
							}
						} else {
							// 新用户，创建用户和账户
							isNewUser = true;
							const userId = generateId();
							const accountId = generateId();
							const now = new Date();

							// 使用 better-auth adapter 创建用户
							user = await ctx.context.adapter.create({
								model: 'user',
								data: {
									id: userId,
									name: nickname || `微信用户${unionid.slice(-6)}`,
									email: `${openid}@${emailDomainName}`,
									image: avatar || null,
									emailVerified: false,
									createdAt: now,
									updatedAt: now,
									// 自定义字段 - 初始积分（与现有流程一致）
									role: 'user',
									credits: 100,
									totalCreditsEarned: 100,
									totalCreditsUsed: 0,
								},
								forceAllowId: true,
							});

							// 使用 better-auth adapter 创建账户关联
							await ctx.context.adapter.create({
								model: 'account',
								data: {
									id: accountId,
									userId: userId,
									providerId: 'wechat',
									accountId: unionid,
									accessToken: openid, // 存储 openid 以备后用
									createdAt: now,
									updatedAt: now,
								},
								forceAllowId: true,
							});

							// 触发用户创建回调
							if (onUserCreated && typeof onUserCreated === 'function') {
								try {
									await onUserCreated({ user, unionid, openid, ctx });
								} catch (callbackError) {
									console.error('[Wechat Plugin] onUserCreated callback error:', callbackError);
								}
							}
						}

						if (!user) {
							return ctx.json(
								{ success: false, error: ERROR_CODES.FAILED_TO_FIND_USER },
								{ status: 500 }
							);
						}

						// 更新最后登录时间
						await ctx.context.adapter.update({
							model: 'user',
							where: [{ field: 'id', value: user.id }],
							update: { lastLoginAt: new Date() },
						});

						// 使用 better-auth internalAdapter 创建会话
						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx.request
						);

						if (!session) {
							return ctx.json(
								{ success: false, error: ERROR_CODES.COULD_NOT_CREATE_SESSION },
								{ status: 500 }
							);
						}

						// 使用 better-auth 官方的 setSessionCookie 设置会话 cookie
						await setSessionCookie(ctx, { session, user });

						// 触发登录成功回调
						if (onSignIn && typeof onSignIn === 'function') {
							try {
								await onSignIn({ user, session, isNewUser, ctx });
							} catch (callbackError) {
								console.error('[Wechat Plugin] onSignIn callback error:', callbackError);
							}
						}

						return ctx.json({
							success: true,
							user: {
								id: user.id,
								name: user.name,
								email: user.email,
								image: user.image,
							},
							session: {
								token: session.token,
								expiresAt: session.expiresAt,
							},
						});
					} catch (error) {
						console.error('[Wechat Plugin] Sign in error:', error);
						return ctx.json(
							{ success: false, error: ERROR_CODES.INTERNAL_ERROR, details: error.message },
							{ status: 500 }
						);
					}
				}
			),

			/**
			 * 检查微信账户是否已绑定
			 */
			checkWechatBinding: createAuthEndpoint(
				'/wechat/check-binding',
				{
					method: 'POST',
					body: z.object({
						unionid: z.string().min(1),
					}),
					metadata: {
						openapi: {
							summary: 'Check WeChat binding status',
							description: 'Check if a WeChat account is already bound to a user',
							tags: ['WeChat'],
							responses: {
								200: {
									description: 'Binding status',
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													bound: { type: 'boolean' },
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { unionid } = ctx.body;

					const existingAccount = await ctx.context.adapter.findOne({
						model: 'account',
						where: [
							{ field: 'providerId', value: 'wechat' },
							{ field: 'accountId', value: unionid },
						],
					});

					return ctx.json({
						bound: !!existingAccount,
					});
				}
			),

			/**
			 * 绑定微信到现有账户（需要登录状态）
			 */
			bindWechat: createAuthEndpoint(
				'/wechat/bind',
				{
					method: 'POST',
					body: z.object({
						unionid: z.string().min(1),
						openid: z.string().min(1),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: 'Bind WeChat to account',
							description: 'Bind a WeChat account to the currently logged in user',
							tags: ['WeChat'],
							security: [{ bearerAuth: [] }],
							responses: {
								200: {
									description: 'Successfully bound',
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													success: { type: 'boolean' },
												},
											},
										},
									},
								},
								400: {
									description: 'WeChat already bound',
								},
								401: {
									description: 'Unauthorized',
								},
							},
						},
					},
				},
				async (ctx) => {
					const { unionid, openid } = ctx.body;
					const userId = ctx.context.session?.user?.id;

					if (!userId) {
						return ctx.json({ success: false, error: ERROR_CODES.UNAUTHORIZED }, { status: 401 });
					}

					// 检查该微信是否已被绑定
					const existingAccount = await ctx.context.adapter.findOne({
						model: 'account',
						where: [
							{ field: 'providerId', value: 'wechat' },
							{ field: 'accountId', value: unionid },
						],
					});

					if (existingAccount) {
						if (existingAccount.userId === userId) {
							return ctx.json(
								{ success: false, error: ERROR_CODES.WECHAT_ALREADY_BOUND_SELF },
								{ status: 400 }
							);
						}
						return ctx.json(
							{ success: false, error: ERROR_CODES.WECHAT_ALREADY_BOUND },
							{ status: 400 }
						);
					}

					// 使用 better-auth adapter 创建绑定
					const now = new Date();
					await ctx.context.adapter.create({
						model: 'account',
						data: {
							id: generateId(),
							userId: userId,
							providerId: 'wechat',
							accountId: unionid,
							accessToken: openid,
							createdAt: now,
							updatedAt: now,
						},
						forceAllowId: true,
					});

					return ctx.json({ success: true });
				}
			),

			/**
			 * 解绑微信账户（需要登录状态）
			 */
			unbindWechat: createAuthEndpoint(
				'/wechat/unbind',
				{
					method: 'POST',
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: 'Unbind WeChat from account',
							description: 'Remove WeChat binding from the currently logged in user',
							tags: ['WeChat'],
							security: [{ bearerAuth: [] }],
							responses: {
								200: {
									description: 'Successfully unbound',
									content: {
										'application/json': {
											schema: {
												type: 'object',
												properties: {
													success: { type: 'boolean' },
												},
											},
										},
									},
								},
								401: {
									description: 'Unauthorized',
								},
								404: {
									description: 'No WeChat binding found',
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.context.session?.user?.id;

					if (!userId) {
						return ctx.json({ success: false, error: ERROR_CODES.UNAUTHORIZED }, { status: 401 });
					}

					// 查找用户的微信绑定
					const existingAccount = await ctx.context.adapter.findOne({
						model: 'account',
						where: [
							{ field: 'providerId', value: 'wechat' },
							{ field: 'userId', value: userId },
						],
					});

					if (!existingAccount) {
						return ctx.json(
							{ success: false, error: 'No WeChat binding found' },
							{ status: 404 }
						);
					}

					// 删除绑定
					await ctx.context.adapter.delete({
						model: 'account',
						where: [{ field: 'id', value: existingAccount.id }],
					});

					return ctx.json({ success: true });
				}
			),
		},

		// 使用 mergeSchema 合并 schema
		schema: mergeSchema(defaultSchema, options?.schema),

		// 钩子处理：登录后执行额外逻辑
		hooks: {
			after: [
				{
					// 匹配登录相关路径
					matcher(ctx) {
						return (
							ctx.path.startsWith('/sign-in') ||
							ctx.path.startsWith('/sign-up') ||
							ctx.path.startsWith('/callback') ||
							ctx.path.startsWith('/oauth2/callback')
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						// 检查是否是微信登录路径，如果是则跳过（已在端点内处理）
						if (ctx.path === '/sign-in/wechat') {
							return;
						}

						// 获取响应中的 set-cookie header
						const setCookie = ctx.context.responseHeaders?.get('set-cookie');
						if (!setCookie) {
							return;
						}

						// 检查是否有会话 cookie
						const sessionTokenName = ctx.context.authCookies.sessionToken.name;
						const sessionCookie = parseSetCookieHeader(setCookie || '')
							.get(sessionTokenName)
							?.value?.split('.')[0];

						if (!sessionCookie) {
							return;
						}

						// 获取当前会话
						const session = await getSessionFromCtx(ctx, {
							disableRefresh: true,
						});

						if (!session) {
							return;
						}

						// 可以在这里添加登录后的通用处理逻辑
						// 例如：记录登录日志、发送通知等
						console.log('[Wechat Plugin] User logged in via hook:', session.user?.id);
					}),
				},
			],
		},

		// 导出错误码供外部使用
		$ERROR_CODES: ERROR_CODES,
	};
};

export default wechatPlugin;
