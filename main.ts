import assert from 'node:assert'
import process from 'node:process'
import { doAttendanceForAccount, testNotifications } from './src'
import 'dotenv/config'

assert(typeof process.env.SKLAND_TOKEN === 'string')

const accounts = Array.from(process.env.SKLAND_TOKEN.split(','))
const withServerChan = process.env.SERVERCHAN_SENDKEY
const withBark = process.env.BARK_URL
const withMessagePusher = process.env.MESSAGE_PUSHER_URL
const withWeChatWork = process.env.WECHATWORK_URL

// 检查命令行参数
if (process.argv.includes('--test-notifications')) {
  // 获取配置
  const options = {
    withServerChan: process.env.SERVER_CHAN_KEY || false,
    withBark: process.env.BARK_URL || false,
    withMessagePusher: process.env.MESSAGE_PUSHER_URL || false,
    withWeChatWork: process.env.WECHATWORK_URL || false,
  }
  
  // 执行通知测试
  try {
    await testNotifications(options)
  } catch (error) {
    console.error('测试通知功能时出错:', error)
    process.exit(1)
  }
}
