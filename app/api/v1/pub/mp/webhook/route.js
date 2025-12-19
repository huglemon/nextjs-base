/**
 * 微信公众号消息回调 API
 * 
 * GET  /api/v1/pub/mp/webhook - 验证服务器配置
 * POST /api/v1/pub/mp/webhook - 接收消息和事件推送
 * 
 * 需要在微信公众号后台配置此 URL
 */

import { NextResponse } from 'next/server';
import {
	verifySignature,
	parseXmlMessage,
	buildXmlResponse,
	getUserInfo,
	saveScanResult,
} from '@/lib/wechat/mp';

/**
 * 验证微信服务器配置（GET 请求）
 */
export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const signature = searchParams.get('signature');
		const timestamp = searchParams.get('timestamp');
		const nonce = searchParams.get('nonce');
		const echostr = searchParams.get('echostr');

		console.log('[WeChat Webhook] Verification request:', { signature, timestamp, nonce });

		// 验证签名
		const isValid = await verifySignature(signature, timestamp, nonce);

		if (isValid) {
			console.log('[WeChat Webhook] Signature verified successfully');
			// 返回 echostr 表示验证成功
			return new Response(echostr, {
				status: 200,
				headers: { 'Content-Type': 'text/plain' },
			});
		} else {
			console.error('[WeChat Webhook] Signature verification failed');
			return new Response('Invalid signature', { status: 403 });
		}
	} catch (error) {
		console.error('[WeChat Webhook] GET error:', error);
		return new Response('Error', { status: 500 });
	}
}

/**
 * 处理微信消息和事件推送（POST 请求）
 */
export async function POST(request) {
	try {
		const { searchParams } = new URL(request.url);
		const signature = searchParams.get('signature');
		const timestamp = searchParams.get('timestamp');
		const nonce = searchParams.get('nonce');

		// 验证签名
		const isValid = await verifySignature(signature, timestamp, nonce);

		if (!isValid) {
			console.error('[WeChat Webhook] POST signature verification failed');
			return new Response('Invalid signature', { status: 403 });
		}

		// 读取请求体（XML 格式）
		const body = await request.text();
		console.log('[WeChat Webhook] Received message:', body);

		// 解析 XML
		const message = parseXmlMessage(body);
		console.log('[WeChat Webhook] Parsed message:', message);

		// 根据消息类型处理
		const response = await handleMessage(message);

		if (response) {
			return new Response(response, {
				status: 200,
				headers: { 'Content-Type': 'application/xml' },
			});
		}

		// 返回 success 表示已处理（不回复消息）
		return new Response('success', {
			status: 200,
			headers: { 'Content-Type': 'text/plain' },
		});
	} catch (error) {
		console.error('[WeChat Webhook] POST error:', error);
		return new Response('success', { status: 200 });
	}
}

/**
 * 处理接收到的消息
 * @param {object} message - 解析后的消息对象
 * @returns {string|null} XML 响应或 null
 */
async function handleMessage(message) {
	const { MsgType, Event, EventKey, FromUserName, ToUserName, Ticket } = message;

	// 处理事件消息
	if (MsgType === 'event') {
		// 扫描带参数二维码事件
		if (Event === 'SCAN' || Event === 'subscribe') {
			// SCAN: 用户已关注时扫码
			// subscribe: 用户未关注时扫码并关注

			// EventKey 格式：
			// - SCAN 事件：直接是 scene_str
			// - subscribe 事件：qrscene_scene_str
			let sceneId = EventKey;
			if (Event === 'subscribe' && sceneId?.startsWith('qrscene_')) {
				sceneId = sceneId.replace('qrscene_', '');
			}

			console.log('[WeChat Webhook] Scan event:', { Event, sceneId, openid: FromUserName });

			// 只处理登录相关的扫码（以 login_ 开头）
			if (sceneId && sceneId.startsWith('login_')) {
				try {
					// 获取用户信息
					const userInfo = await getUserInfo(FromUserName);
					console.log('[WeChat Webhook] User info:', userInfo);

					// 保存扫码结果
					saveScanResult(sceneId, {
						unionid: userInfo.unionid || userInfo.openid, // 有些公众号没有 unionid
						openid: userInfo.openid,
						nickname: userInfo.nickname || '',
						avatar: userInfo.headimgurl || '',
					});

					// 回复用户扫码成功消息
					return buildXmlResponse({
						ToUserName: FromUserName,
						FromUserName: ToUserName,
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: 'text',
						Content: '✅ 扫码成功！请返回网页完成登录。',
					});
				} catch (error) {
					console.error('[WeChat Webhook] Handle scan error:', error);

					return buildXmlResponse({
						ToUserName: FromUserName,
						FromUserName: ToUserName,
						CreateTime: Math.floor(Date.now() / 1000),
						MsgType: 'text',
						Content: '❌ 登录失败，请稍后重试。',
					});
				}
			}

			// 普通关注事件，发送欢迎消息
			if (Event === 'subscribe' && !sceneId) {
				return buildXmlResponse({
					ToUserName: FromUserName,
					FromUserName: ToUserName,
					CreateTime: Math.floor(Date.now() / 1000),
					MsgType: 'text',
					Content: '欢迎关注！',
				});
			}
		}
	}

	return null;
}

