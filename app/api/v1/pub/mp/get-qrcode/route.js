/**
 * 获取微信登录二维码 API
 * 
 * GET /api/v1/pub/mp/get-qrcode
 * 返回：{ sceneId, qrcodeUrl, expiresIn }
 */

import { NextResponse } from 'next/server';
import { createTempQrCode, getQrCodeImageUrl, generateSceneId } from '@/lib/wechat/mp';

export async function GET() {
	try {
		// 生成唯一的场景值
		const sceneId = generateSceneId();

		// 创建临时二维码（5分钟有效）
		const qrResult = await createTempQrCode(sceneId, 300);

		// 获取二维码图片 URL
		const qrcodeUrl = getQrCodeImageUrl(qrResult.ticket);

		return NextResponse.json({
			success: true,
			data: {
				sceneId,
				qrcodeUrl,
				expiresIn: qrResult.expire_seconds,
			},
		});
	} catch (error) {
		console.error('[API] Get QR code error:', error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || 'Failed to generate QR code',
			},
			{ status: 500 }
		);
	}
}

