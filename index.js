const crypto = require('crypto')
const schedule = require('node-schedule')
const fetch = require('node-fetch')
const uuid = require('uuid')
const config = require('./config.json')

const APP_VERSION = '2.3.0'
const USER_AGENT = `Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) miHoYoBBS/${APP_VERSION}`
const REFERER = 'https://webstatic.mihoyo.com/bbs/event/signin-ys/index.html?bbs_auth_required=true&act_id=e202009291139501&utm_source=bbs&utm_medium=mys&utm_campaign=icon'
const HOST = 'api-takumi.mihoyo.com'
const GET_ROLE_URL = 'https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn'
const SIGN_URL = 'https://api-takumi.mihoyo.com/event/bbs_sign_reward/sign'
const deviceId = uuid.v4().replace(/-/g, '')

function md5(str) {
  const md5 = crypto.createHash('md5')
  md5.update(str)
  return md5.digest('hex')
}

function getDS() {
  const s = 'h8w582wxwgqvahcdkpvdhbh2w9casgfl'
  const t = Math.floor(Date.now() / 1000)
  const r = Math.random().toString(36).slice(-6)
  const c = `salt=${s}&t=${t}&r=${r}`
  return `${t},${r},${md5(c)}`
}

function getHeaders() {
  return {
    'User-Agent': USER_AGENT,
    'Referer': REFERER,
    'Host': HOST,
    'DS': getDS(),
    'x-rpc-channel': 'appstore',
    'x-requested-with': 'com.mihoyo.hyperion',
    'x-rpc-app_version': APP_VERSION,
    'x-rpc-client_type': '5',
    'x-rpc-device_id': deviceId,
    'Cookie': config.MYS_COOKIE
  }
}

async function getUserGameRolesByCookie() {
  const resp = await fetch(GET_ROLE_URL, {
    'headers': getHeaders(),
    'method': 'GET'
  })
  const { retcode, data, message } = await resp.json()
  if (retcode != 0) throw new Error(message)
  return data.list
}

async function sign({ region, game_uid: uid, region_name, nickname, level }) {
  const resp = await fetch(SIGN_URL, {
    'headers': getHeaders(),
    'body': JSON.stringify({ act_id: 'e202009291139501', region, uid }),
    'method': 'POST'
  })
  const { message } = await resp.json()
  const now = new Date().toLocaleString('zh-cn-u-hc-h23')
  const tips = `${now}\n【${region_name}】— ${nickname}\n【Lv : ${level}】— ${uid}\n签到结果：${message}`
  return tips
}

async function pushNotice(content) {
  console.log('push notice: ', content)
  content = 'Sign_Notice\n' + content
  const url = config.DINGTALK_BOT
  if (url) {
    const resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ msgtype: 'text', text: { content } }),
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    })
    const text = await resp.text()
    console.log('push status:', text)
  }
}

async function runJob() {
  try {
    const list = await getUserGameRolesByCookie()
    for (const item of list) {
      const tips = await sign(item)
      await pushNotice(tips)
    }
  } catch (error) {
    await pushNotice('签到失败：' + error.message)
  }
}

schedule.scheduleJob('11 11 * * *', () => {
  console.log('sign job run start:', new Date().toLocaleString('zh'))
  const tid = setTimeout(async () => {
    await runJob()
    clearTimeout(tid)
    console.log('sign job run end:', new Date().toLocaleString('zh'))
  }, Math.random().toString().slice(-7))
})

console.log('process start at:', new Date().toLocaleString('zh'))

process.on('SIGINT', async () => {
  await schedule.gracefulShutdown()
  process.exit(0)
})
