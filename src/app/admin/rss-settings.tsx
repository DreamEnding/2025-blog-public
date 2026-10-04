'use client'

import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, RefreshCw } from 'lucide-react'
import type { PublicRssRuntime } from '@/lib/rss-runtime'
import ZhihuLogin from './zhihu-login'

type Props = {
	url: string
	configuration: PublicRssRuntime | null
	busy: boolean
	action: (name: string, payload?: Record<string, unknown>) => Promise<any>
	onTask: (task: () => Promise<void>) => Promise<void>
	onSaved: () => Promise<void>
}

export default function RssSettings({ url, configuration, busy, action, onTask, onSaved }: Props) {
	const [address, setAddress] = useState(url)
	const [values, setValues] = useState({ zhihuCookies: '', rsshubProxy: '', fetchProxy: '' })
	const [clear, setClear] = useState({ clearCookie: false, clearRsshubProxy: false, clearFetchProxy: false })
	const [visible, setVisible] = useState(false)
	const [status, setStatus] = useState('')
	useEffect(() => {
		setAddress(url)
	}, [url])

	return (
		<form
			className='admin-rss-settings'
			aria-label='RSS 抓取配置'
			onSubmit={event => {
				event.preventDefault()
				void onTask(async () => {
					const result = await action('save-rss-settings', {
						url: address,
						...clear,
						zhihuCookies: clear.clearCookie ? '' : values.zhihuCookies,
						rsshubProxy: clear.clearRsshubProxy ? '' : values.rsshubProxy,
						fetchProxy: clear.clearFetchProxy ? '' : values.fetchProxy
					})
					setValues({ zhihuCookies: '', rsshubProxy: '', fetchProxy: '' })
					setClear({ clearCookie: false, clearRsshubProxy: false, clearFetchProxy: false })
					setVisible(false)
					setStatus(result.message)
					await onSaved()
				})
			}}>
			<div className='admin-rss-settings-heading'>
				<h3>抓取配置</h3>
				<p>修改后保存，配套 RSSHub 会自动加载新配置。敏感内容保存后不回显，留空会保留现有值。</p>
			</div>
			<div className='admin-rss-settings-grid'>
				<label>
					RSSHub 服务地址
					<input required value={address} disabled={busy} onChange={event => setAddress(event.target.value)} placeholder='http://rsshub:1200' />
				</label>
				<div className='admin-rss-setting-field'>
					<label>
						知乎登录 Cookie（ZHIHU_COOKIES）
						<div className='admin-rss-secret-input'>
							<input
								type={visible ? 'text' : 'password'}
								autoComplete='new-password'
								maxLength={32000}
								value={values.zhihuCookies}
								disabled={busy || clear.clearCookie}
								onChange={event => setValues(current => ({ ...current, zhihuCookies: event.target.value }))}
								placeholder={configuration?.cookieConfigured ? '已配置；留空保留，输入新值可替换' : '未配置；粘贴知乎请求头中的 Cookie 内容'}
							/>
							<button
								className='admin-icon-button'
								type='button'
								aria-label={visible ? '隐藏输入的 Cookie' : '显示输入的 Cookie'}
								disabled={busy}
								onClick={() => setVisible(value => !value)}>
								{visible ? <EyeOff size={17} /> : <Eye size={17} />}
							</button>
						</div>
					</label>
					<p>从你已登录的知乎页面复制 Cookie 请求头内容。有效性需要通过刷新知乎订阅验证。</p>
					<label className='admin-rss-clear'>
						<input
							type='checkbox'
							checked={clear.clearCookie}
							disabled={busy}
							onChange={event => setClear(current => ({ ...current, clearCookie: event.target.checked }))}
						/>
						清空已保存的知乎 Cookie
					</label>
				</div>
				{(
					[
						[
							'rsshubProxy',
							'clearRsshubProxy',
							'RSSHub 抓取代理（RSSHUB_PROXY_URI）',
							configuration?.rsshubProxySummary,
							'用于 RSSHub 访问知乎等来源。Docker 中填写容器可访问的代理地址。'
						],
						['fetchProxy', 'clearFetchProxy', '网站下载代理（RSS_FETCH_PROXY）', configuration?.fetchProxySummary, '用于本站下载远程图片及完整 RSS URL。']
					] as const
				).map(([key, clearKey, label, summary, description]) => (
					<div className='admin-rss-setting-field' key={key}>
						<label>
							{label}
							<input
								type='password'
								autoComplete='new-password'
								maxLength={2000}
								value={values[key]}
								disabled={busy || clear[clearKey]}
								onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
								placeholder={summary ? `已配置 ${summary}；留空保留` : '未配置；如 http://127.0.0.1:7897'}
							/>
						</label>
						<p>{description} 支持 HTTP/HTTPS 代理，地址可包含用户名和密码。</p>
						<label className='admin-rss-clear'>
							<input
								type='checkbox'
								checked={clear[clearKey]}
								disabled={busy}
								onChange={event => setClear(current => ({ ...current, [clearKey]: event.target.checked }))}
							/>
							停用此代理
						</label>
					</div>
				))}
			</div>
			<div className='admin-rss-actions'>
				<ZhihuLogin
					busy={busy}
					action={action}
					onTask={onTask}
					onImported={async message => {
						setValues(current => ({ ...current, zhihuCookies: '' }))
						setClear(current => ({ ...current, clearCookie: false }))
						setStatus(message)
						await onSaved()
					}}
				/>
				<button className='admin-button primary' type='submit' disabled={busy}>
					<Check size={17} />
					{busy ? '处理中…' : '保存抓取配置'}
				</button>
				<button
					className='admin-button quiet'
					type='button'
					disabled={busy}
					onClick={() =>
						void onTask(async () => {
							const result = await action('check-rsshub', { url: address })
							setStatus(result.message)
						})
					}>
					<RefreshCw size={17} />
					检查服务连接
				</button>
				{configuration?.savedAt && <span className='admin-empty-copy'>上次保存：{new Date(configuration.savedAt).toLocaleString('zh-CN')}</span>}
			</div>
			{status && (
				<p className='admin-feedback' role='status'>
					{status}
				</p>
			)}
		</form>
	)
}
