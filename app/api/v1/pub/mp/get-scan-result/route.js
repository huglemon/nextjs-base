/**
 * 获取扫码结果 API
 * 
 * GET /api/v1/pub/mp/get-scan-result?sceneId=xxx
 * 返回：{ scanned: boolean, data?: { unionid, openid, nickname, avatar } }
 */

import { NextResponse } from 'next/server';
import { getScanResult, deleteScanResult } from '@/lib/wechat/mp';

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const sceneId = searchParams.get('sceneId');

		if (!sceneId) {
			return NextResponse.json(
				{
					success: false,
					error: 'sceneId is required',
				},
				{ status: 400 }
			);
		}

		// 获取扫码结果
		const result = getScanResult(sceneId);

		if (!result) {
			return NextResponse.json({
				success: true,
				data: {
					scanned: false,
				},
			});
		}

		// 获取成功后删除缓存（一次性使用）
		deleteScanResult(sceneId);

		return NextResponse.json({
			success: true,
			data: {
				scanned: true,
				unionid: result.unionid,
				openid: result.openid,
				nickname: result.nickname,
				avatar: result.avatar,
			},
		});
	} catch (error) {
		console.error('[API] Get scan result error:', error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || 'Failed to get scan result',
			},
			{ status: 500 }
		);
	}
}

