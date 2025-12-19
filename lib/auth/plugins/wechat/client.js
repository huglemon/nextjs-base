/**
 * 微信扫码登录 Better Auth 客户端插件
 *
 * 提供以下方法用于前端调用：
 * - signInWechat: 微信扫码登录
 * - checkWechatBinding: 检查微信是否已绑定
 * - bindWechat: 绑定微信到当前账户
 * - unbindWechat: 解绑当前账户的微信
 */

/**
 * 微信登录客户端插件
 * @returns {object} Better Auth 客户端插件配置
 */
export const wechatClient = () => ({
	id: 'wechat',

	// 获取插件动作
	getActions: ($fetch) => ({
		/**
		 * 微信扫码登录
		 * @param {object} params - 登录参数
		 * @param {string} params.unionid - 微信 unionid
		 * @param {string} params.openid - 微信 openid
		 * @param {string} [params.nickname] - 微信昵称
		 * @param {string} [params.avatar] - 微信头像
		 * @param {object} [fetchOptions] - fetch 选项
		 * @returns {Promise<{success: boolean, user?: object, session?: object, error?: string}>}
		 */
		signInWechat: async (params, fetchOptions) => {
			const response = await $fetch('/sign-in/wechat', {
				method: 'POST',
				body: params,
				...fetchOptions,
			});
			return response;
		},

		/**
		 * 检查微信是否已绑定
		 * @param {object} params - 参数
		 * @param {string} params.unionid - 微信 unionid
		 * @param {object} [fetchOptions] - fetch 选项
		 * @returns {Promise<{bound: boolean}>}
		 */
		checkWechatBinding: async (params, fetchOptions) => {
			const response = await $fetch('/wechat/check-binding', {
				method: 'POST',
				body: params,
				...fetchOptions,
			});
			return response;
		},

		/**
		 * 绑定微信到当前账户
		 * @param {object} params - 参数
		 * @param {string} params.unionid - 微信 unionid
		 * @param {string} params.openid - 微信 openid
		 * @param {object} [fetchOptions] - fetch 选项
		 * @returns {Promise<{success: boolean, error?: string}>}
		 */
		bindWechat: async (params, fetchOptions) => {
			const response = await $fetch('/wechat/bind', {
				method: 'POST',
				body: params,
				...fetchOptions,
			});
			return response;
		},

		/**
		 * 解绑当前账户的微信
		 * @param {object} [fetchOptions] - fetch 选项
		 * @returns {Promise<{success: boolean, error?: string}>}
		 */
		unbindWechat: async (fetchOptions) => {
			const response = await $fetch('/wechat/unbind', {
				method: 'POST',
				...fetchOptions,
			});
			return response;
		},
	}),

	// 扩展 signIn 对象（可用于将方法挂载到 signIn 命名空间）
	getAtoms: ($fetch) => {
		// 返回空对象，actions 已经足够
		return {};
	},

	// 定义路径方法映射（用于类型推断）
	pathMethods: {
		'/sign-in/wechat': 'POST',
		'/wechat/check-binding': 'POST',
		'/wechat/bind': 'POST',
		'/wechat/unbind': 'POST',
	},
});

export default wechatClient;

