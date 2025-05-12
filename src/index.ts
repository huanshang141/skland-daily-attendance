import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { attendance, auth, getBinding, signIn } from './api'
import { bark, serverChan, messagePusher, wechatworkBot } from './notifications'
import { getPrivacyName } from './utils'

interface Options {
  /** server 酱推送功能的启用，false 或者 server 酱的token */
  withServerChan?: false | string
  /** bark 推送功能的启用，false 或者 bark 的 URL */
  withBark?: false | string
  /** 消息推送功能的启用，false 或者 message-pusher 的 WebHook URL */
  withMessagePusher?: false | string
  /** 企业微信推送功能的启用，false 或者企业微信的 WebHook URL */
  withWeChatWork?: false | string
}

export async function doAttendanceForAccount(token: string, options: Options) {
  const createCombinePushMessage = () => {
    const messages: string[] = []
    let hasError = false
    const logger = (message: string, error?: boolean) => {
      messages.push(message)
      console[error ? 'error' : 'log'](message)
      if (error && !hasError)
        hasError = true
    }
    const push
      = async () => {
        if (options.withServerChan) {
          await serverChan(
            options.withServerChan,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
        if (options.withBark) {
          await bark(
            options.withBark,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
        if (options.withMessagePusher) {
          await messagePusher(
            options.withMessagePusher,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
        if (options.withWeChatWork) {
          await wechatworkBot(
            options.withWeChatWork,
            `【森空岛每日签到】`,
            messages.join('\n\n'),
          )
        }
      }
    const add = (message: string) => {
      messages.push(message)
    }
    return [logger, push, add] as const
  }

  const [combineMessage, excutePushMessage, addMessage] = createCombinePushMessage()

  addMessage('## 明日方舟签到')
  let shouldContinue = true // 添加标志控制流程

  try {
    const { code } = await auth(token)
    const { cred, token: signToken } = await signIn(code)
    const { list } = await getBinding(cred, signToken)

    let successAttendance = 0
    const characterList = list.map(i => i.bindingList).flat()
    const maxRetries = parseInt(process.env.MAX_RETRIES, 10) || 3
    await Promise.all(characterList.map(async (character) => {
      if (!shouldContinue) return // 如果设置了终止标志则跳过处理

      console.log(`将签到第${successAttendance + 1}个角色`)
      let retries = 0 // 初始化重试计数器
      while (retries < maxRetries) {
        try {
          const data = await attendance(cred, signToken, {
            uid: character.uid,
            gameId: character.channelMasterId,
          })
          if (data) {
            if (data.code === 0 && data.message === 'OK') {
              const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 签到成功${`, 获得了${data.data.awards.map(a => `「${a.resource.name}」${a.count}个`).join(',')}`}`
              combineMessage(msg)
              successAttendance++
              break // 签到成功，跳出重试循环
            }
            else {
              const msg = `${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 签到失败${`, 错误消息: ${data.message}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}`
              combineMessage(msg, true)
              retries++ // 签到失败，增加重试计数器
            }
          }
          else {
            combineMessage(`${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 今天已经签到过了`)
            break // 已经签到过，跳出重试循环
          }
        }
        catch (error: any) {
          if (error.response && error.response.status === 403) {
            combineMessage(`${(Number(character.channelMasterId) - 1) ? 'B 服' : '官服'}角色 ${successAttendance + 1} 今天已经签到过了`)
            break // 已经签到过，跳出重试循环
          }
          else {
            combineMessage(`签到过程中出现未知错误: ${error.message}`, true)
            console.error('发生未知错误，工作流中断。')
            retries++ // 增加重试计数器
            if (retries >= maxRetries) {
              combineMessage(`角色 ${successAttendance + 1} 已达到最大重试次数 ${maxRetries}，跳过此角色`, true)
              shouldContinue = false // 设置终止标志
              break // 但不再直接退出，而是跳出重试循环
            }
          }
        }
        // 多个角色之间的延时
        await setTimeout(3000)
      }
    }))
    if (successAttendance !== 0)
      combineMessage(`成功签到${successAttendance}个角色`)
  } catch (error: any) {
    // 处理顶层网络错误，特别是超时错误
    let errorMessage = `森空岛签到失败: ${error.message || '未知错误'}`

    // 检测是否为超时错误
    if (error.cause) {
      if (error.cause.code === 'ETIMEDOUT' || error.cause.code === 'ECONNABORTED' || error.cause.code === 'ECONNRESET') {
        errorMessage = `森空岛签到发生网络超时错误: ${error.cause.code} - ${error.cause.syscall || ''}`;
      } else if (error.cause.code === 'UND_ERR_CONNECT_TIMEOUT') {
        errorMessage = `森空岛签到发生连接超时错误: ${error.cause.code}`;
      } else if (error.cause.message && error.cause.message.includes('timeout')) {
        errorMessage = `森空岛签到发生网络超时错误: ${error.cause.message}`;
      } else if (error.cause.cause) {
        // 处理嵌套的错误原因
        errorMessage = `森空岛签到发生网络错误: ${error.cause.cause.code || error.cause.cause.message || '未知原因'}`;
      }
    }

    // 记录详细错误信息以便调试
    console.error('签到过程发生错误:', error);

    // 添加错误信息到通知
    combineMessage(errorMessage, true);
  }

  // 确保通知会发送，即使发生错误
  try {
    await excutePushMessage()
    console.log("通知发送完成")
  } catch (err) {
    console.error("发送通知时出错:", err)
  }

  // 如果需要在所有操作完成后退出程序，可以放在这里
  // 但确保通知已经发送
  return
}

// 新增函数用于测试通知功能
export async function testNotifications(options: Options) {
  console.log("开始测试通知功能...")
  
  const createCombinePushMessage = () => {
    const messages: string[] = []
    let hasError = false
    const logger = (message: string, error?: boolean) => {
      messages.push(message)
      console[error ? 'error' : 'log'](message)
      if (error && !hasError)
        hasError = true
    }
    const push = async () => {
      let successCount = 0
      let failCount = 0
      
      try {
        if (options.withServerChan) {
          console.log("测试 Server酱 通知...")
          await serverChan(
            options.withServerChan,
            `【测试】森空岛签到通知测试`,
            messages.join('\n\n'),
          )
          console.log("✅ Server酱 通知发送成功")
          successCount++
        }
      } catch (error) {
        console.error("❌ Server酱 通知发送失败:", error)
        failCount++
      }
      
      try {
        if (options.withBark) {
          console.log("测试 Bark 通知...")
          await bark(
            options.withBark,
            `【测试】森空岛签到通知测试`,
            messages.join('\n\n'),
          )
          console.log("✅ Bark 通知发送成功")
          successCount++
        }
      } catch (error) {
        console.error("❌ Bark 通知发送失败:", error)
        failCount++
      }
      
      try {
        if (options.withMessagePusher) {
          console.log("测试 MessagePusher 通知...")
          await messagePusher(
            options.withMessagePusher,
            `【测试】森空岛签到通知测试`,
            messages.join('\n\n'),
          )
          console.log("✅ MessagePusher 通知发送成功")
          successCount++
        }
      } catch (error) {
        console.error("❌ MessagePusher 通知发送失败:", error)
        failCount++
      }
      
      try {
        if (options.withWeChatWork) {
          console.log("测试 企业微信 通知...")
          await wechatworkBot(
            options.withWeChatWork,
            `【测试】森空岛签到通知测试`,
            messages.join('\n\n'),
          )
          console.log("✅ 企业微信 通知发送成功")
          successCount++
        }
      } catch (error) {
        console.error("❌ 企业微信 通知发送失败:", error)
        failCount++
      }
      
      console.log(`\n通知测试完成! 成功: ${successCount}, 失败: ${failCount}`)
      return { successCount, failCount }
    }
    
    const add = (message: string) => {
      messages.push(message)
    }
    
    return [logger, push, add] as const
  }
  
  const [logger, push, add] = createCombinePushMessage()
  
  // 添加测试消息
  add("## 这是一条测试通知")
  add("如果您看到这条消息，说明通知功能运行正常！")
  add(`发送时间：${new Date().toLocaleString()}`)
  
  // 发送测试通知
  await push()
}
