/**
 * 微信扫码登录 Better Auth 客户端插件
 * 
 * 提供 signIn.wechat() 方法用于前端调用
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
		 * @returns {Promise<object>} 登录结果
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
		 * @returns {Promise<{success: boolean}>}
		 */
		bindWechat: async (params, fetchOptions) => {
			const response = await $fetch('/wechat/bind', {
				method: 'POST',
				body: params,
				...fetchOptions,
			});
			return response;
		},
	}),

	// 扩展 signIn 对象
	getAtoms: ($fetch) => {
		// 返回空对象，actions 已经足够
		return {};
	},
});

export default wechatClient;

