import Script from 'next/script'

export default function Head({ analyticsId }: { analyticsId: string }) {
	return (
		<head>
			<link rel='icon' href='/favicon.png' />

			<link rel='preconnect' href='https://fonts.googleapis.cn' />
			<link rel='preconnect' href='https://fonts.gstatic.cn' crossOrigin='anonymous' />

			<link href='https://fonts.googleapis.cn/css2?family=Averia+Gruesa+Libre&display=swap' rel='stylesheet' />

			{analyticsId && /^G-[A-Z0-9]+$/.test(analyticsId) && (
				<>
					<Script src={`https://www.googletagmanager.com/gtag/js?id=${analyticsId}`} />
					<Script id='google-analytics'>
						{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', ${JSON.stringify(analyticsId)});
        `}
					</Script>
				</>
			)}
		</head>
	)
}
