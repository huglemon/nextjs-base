'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { authClient } from '@/lib/auth/auth-client';

// 轮询间隔（毫秒）
const POLL_INTERVAL = 2000;

// 二维码状态
const QR_STATUS = {
	LOADING: 'loading',
	READY: 'ready',
	SCANNING: 'scanning', // 暂时未用，可扩展
	SUCCESS: 'success',
	EXPIRED: 'expired',
	ERROR: 'error',
};

/**
 * 微信扫码登录对话框
 * @param {object} props
 * @param {function} props.onSuccess - 登录成功回调
 * @param {React.ReactNode} props.trigger - 触发按钮
 * @param {boolean} [props.disabled] - 是否禁用
 */
export function WechatLoginDialog({ onSuccess, trigger, disabled = false }) {
	const t = useTranslations();
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState(QR_STATUS.LOADING);
	const [qrData, setQrData] = useState(null);
	const [error, setError] = useState('');
	const [countdown, setCountdown] = useState(0);
	const pollingRef = useRef(null);
	const countdownRef = useRef(null);

	// 获取二维码
	const fetchQrCode = useCallback(async () => {
		setStatus(QR_STATUS.LOADING);
		setError('');

		try {
			const response = await fetch('/api/v1/pub/mp/get-qrcode');
			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to get QR code');
			}

			setQrData(result.data);
			setCountdown(result.data.expiresIn);
			setStatus(QR_STATUS.READY);
		} catch (err) {
			console.error('Get QR code error:', err);
			setError(err.message);
			setStatus(QR_STATUS.ERROR);
		}
	}, []);

	// 轮询扫码结果
	const pollScanResult = useCallback(async () => {
		if (!qrData?.sceneId) return;

		try {
			const response = await fetch(`/api/v1/pub/mp/get-scan-result?sceneId=${qrData.sceneId}`);
			const result = await response.json();

			if (result.success && result.data.scanned) {
				// 扫码成功，停止轮询
				stopPolling();
				setStatus(QR_STATUS.SUCCESS);

				// 调用 better-auth 登录
				const loginResult = await authClient.signInWechat({
					unionid: result.data.unionid,
					openid: result.data.openid,
					nickname: result.data.nickname,
					avatar: result.data.avatar,
				});

				if (loginResult.error) {
					setError(loginResult.error.message || 'Login failed');
					setStatus(QR_STATUS.ERROR);
					return;
				}

				// 登录成功
				setTimeout(() => {
					setOpen(false);
					onSuccess?.();
				}, 1000);
			}
		} catch (err) {
			console.error('Poll scan result error:', err);
			// 不中断轮询，继续等待
		}
	}, [qrData?.sceneId, onSuccess]);

	// 开始轮询
	const startPolling = useCallback(() => {
		if (pollingRef.current) return;
		pollingRef.current = setInterval(pollScanResult, POLL_INTERVAL);
	}, [pollScanResult]);

	// 停止轮询
	const stopPolling = useCallback(() => {
		if (pollingRef.current) {
			clearInterval(pollingRef.current);
			pollingRef.current = null;
		}
	}, []);

	// 开始倒计时
	const startCountdown = useCallback(() => {
		if (countdownRef.current) return;
		countdownRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					// 倒计时结束，二维码过期
					stopPolling();
					if (countdownRef.current) {
						clearInterval(countdownRef.current);
						countdownRef.current = null;
					}
					setStatus(QR_STATUS.EXPIRED);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	}, [stopPolling]);

	// 停止倒计时
	const stopCountdown = useCallback(() => {
		if (countdownRef.current) {
			clearInterval(countdownRef.current);
			countdownRef.current = null;
		}
	}, []);

	// 刷新二维码
	const handleRefresh = useCallback(() => {
		stopPolling();
		stopCountdown();
		fetchQrCode();
	}, [stopPolling, stopCountdown, fetchQrCode]);

	// 对话框打开时获取二维码
	useEffect(() => {
		if (open) {
			fetchQrCode();
		} else {
			stopPolling();
			stopCountdown();
			setStatus(QR_STATUS.LOADING);
			setQrData(null);
			setError('');
		}

		return () => {
			stopPolling();
			stopCountdown();
		};
	}, [open, fetchQrCode, stopPolling, stopCountdown]);

	// 二维码就绪后开始轮询和倒计时
	useEffect(() => {
		if (status === QR_STATUS.READY && qrData) {
			startPolling();
			startCountdown();
		}

		return () => {
			stopPolling();
			stopCountdown();
		};
	}, [status, qrData, startPolling, startCountdown, stopPolling, stopCountdown]);

	// 格式化倒计时
	const formatCountdown = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild disabled={disabled}>
				{trigger}
			</DialogTrigger>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<svg className='w-6 h-6 text-green-500' viewBox='0 0 24 24' fill='currentColor'>
							<path d='M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.133 0 .241-.108.241-.245 0-.06-.024-.12-.04-.177l-.325-1.233a.492.492 0 01.177-.554c1.528-1.12 2.502-2.782 2.502-4.633 0-3.371-3.037-6.11-7.062-6.11zm-2.745 3.254c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm5.49 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z' />
						</svg>
						{t('auth.wechatLogin')}
					</DialogTitle>
					<DialogDescription>{t('auth.wechatLoginDesc')}</DialogDescription>
				</DialogHeader>

				<div className='flex flex-col items-center justify-center py-4'>
					{/* 加载状态 */}
					{status === QR_STATUS.LOADING && (
						<div className='w-48 h-48 flex items-center justify-center bg-gray-100 rounded-lg'>
							<Loader2 className='w-8 h-8 animate-spin text-gray-400' />
						</div>
					)}

					{/* 二维码就绪 */}
					{status === QR_STATUS.READY && qrData && (
						<>
							<div className='relative'>
								<img
									src={qrData.qrcodeUrl}
									alt='WeChat QR Code'
									className='w-48 h-48 rounded-lg border'
								/>
							</div>
							<p className='mt-3 text-sm text-muted-foreground'>
								{t('auth.qrcodeExpireIn', { time: formatCountdown(countdown) })}
							</p>
						</>
					)}

					{/* 登录成功 */}
					{status === QR_STATUS.SUCCESS && (
						<div className='w-48 h-48 flex flex-col items-center justify-center bg-green-50 rounded-lg'>
							<CheckCircle2 className='w-12 h-12 text-green-500 mb-2' />
							<p className='text-green-600 font-medium'>{t('auth.loginSuccess')}</p>
						</div>
					)}

					{/* 二维码过期 */}
					{status === QR_STATUS.EXPIRED && (
						<div className='w-48 h-48 flex flex-col items-center justify-center bg-gray-100 rounded-lg'>
							<p className='text-gray-500 mb-3'>{t('auth.qrcodeExpired')}</p>
							<Button variant='outline' size='sm' onClick={handleRefresh}>
								<RefreshCw className='w-4 h-4 mr-2' />
								{t('common.refresh')}
							</Button>
						</div>
					)}

					{/* 错误状态 */}
					{status === QR_STATUS.ERROR && (
						<div className='w-48 h-48 flex flex-col items-center justify-center bg-red-50 rounded-lg'>
							<XCircle className='w-12 h-12 text-red-500 mb-2' />
							<p className='text-red-600 text-sm text-center px-4'>{error}</p>
							<Button variant='outline' size='sm' className='mt-3' onClick={handleRefresh}>
								<RefreshCw className='w-4 h-4 mr-2' />
								{t('common.retry')}
							</Button>
						</div>
					)}
				</div>

				<p className='text-xs text-center text-muted-foreground'>
					{t('auth.wechatLoginTip')}
				</p>
			</DialogContent>
		</Dialog>
	);
}

export default WechatLoginDialog;

