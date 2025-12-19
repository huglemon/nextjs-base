/**
 * 微信扫码登录 Better Auth 服务端插件
 * 
 * 通过微信公众号带参二维码实现扫码登录
 * 用户扫码后关注公众号或已关注则直接获取 unionid/openid
 */

import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { z } from 'zod';

/**
 * 微信扫码登录插件
 * @returns {object} Better Auth 插件配置
 */
export const wechatPlugin = () => ({
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
			},
			async (ctx) => {
				const { unionid, openid, nickname, avatar } = ctx.body;

				try {
					// 查找现有用户（通过 account 表的 wechat provider）
					const existingAccount = await ctx.context.adapter.findOne({
						model: 'account',
						where: [
							{ field: 'providerId', value: 'wechat' },
							{ field: 'accountId', value: unionid },
						],
					});

					let user;

					if (existingAccount) {
						// 已有用户，获取用户信息
						user = await ctx.context.adapter.findOne({
							model: 'user',
							where: [{ field: 'id', value: existingAccount.userId }],
						});

						// 更新用户头像和昵称（如果有新的）
						if (user && (nickname || avatar)) {
							const updateData = {};
							if (nickname && !user.name) updateData.name = nickname;
							if (avatar && !user.image) updateData.image = avatar;
							
							if (Object.keys(updateData).length > 0) {
								await ctx.context.adapter.update({
									model: 'user',
									where: [{ field: 'id', value: user.id }],
									update: updateData,
								});
								user = { ...user, ...updateData };
							}
						}
					} else {
						// 新用户，创建用户和账户
						const userId = ctx.context.generateId();
						const now = new Date();

						// 创建用户
						user = await ctx.context.adapter.create({
							model: 'user',
							data: {
								id: userId,
								name: nickname || `微信用户${unionid.slice(-6)}`,
								email: `${unionid}@wechat.placeholder`, // 占位邮箱
								image: avatar || null,
								emailVerified: false,
								createdAt: now,
								updatedAt: now,
								// 自定义字段
								role: 'user',
								credits: 0,
								totalCreditsEarned: 0,
								totalCreditsUsed: 0,
							},
						});

						// 创建账户关联
						await ctx.context.adapter.create({
							model: 'account',
							data: {
								id: ctx.context.generateId(),
								userId: userId,
								providerId: 'wechat',
								accountId: unionid,
								accessToken: openid, // 存储 openid 以备后用
								createdAt: now,
								updatedAt: now,
							},
						});
					}

					if (!user) {
						return ctx.json({ error: 'Failed to create or find user' }, { status: 500 });
					}

					// 更新最后登录时间
					await ctx.context.adapter.update({
						model: 'user',
						where: [{ field: 'id', value: user.id }],
						update: { lastLoginAt: new Date() },
					});

					// 创建会话
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.request
					);

					// 设置会话 cookie
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						session.token,
						ctx.context.secret,
						ctx.context.authCookies.sessionToken.options
					);

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
						{ error: 'Internal server error', details: error.message },
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
			},
			async (ctx) => {
				const { unionid, openid } = ctx.body;
				const userId = ctx.context.session?.user?.id;

				if (!userId) {
					return ctx.json({ error: 'Unauthorized' }, { status: 401 });
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
						return ctx.json({ error: 'Already bound to this account' }, { status: 400 });
					}
					return ctx.json({ error: 'WeChat already bound to another account' }, { status: 400 });
				}

				// 创建绑定
				const now = new Date();
				await ctx.context.adapter.create({
					model: 'account',
					data: {
						id: ctx.context.generateId(),
						userId: userId,
						providerId: 'wechat',
						accountId: unionid,
						accessToken: openid,
						createdAt: now,
						updatedAt: now,
					},
				});

				return ctx.json({ success: true });
			}
		),
	},

	schema: {
		// 扩展 account 表，添加微信特定字段（可选）
		account: {
			fields: {
				// accessToken 用于存储 openid
			},
		},
	},
});

export default wechatPlugin;

