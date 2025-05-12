export async function wechatworkBot(url: string, title: string, content: string) {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      console.error('Wrong type for WeChatWork Webhook URL.')
      return -1
    }
  
    const payload = {
      msgtype: "markdown",
      markdown: {
        content: `## ${title}\n${content}`
      }
    }
  
    try {
      const resp = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      )
      const data = await resp.json()
      console.debug(data)
    }
    catch (error) {
      console.error(`[WeChatWork] Error: ${error}`)
      return -1
    }
  }