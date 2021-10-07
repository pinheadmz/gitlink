module.exports = {
  port: 8080,
  password: '< BASICAUTH PASSWORD - SET IN GITHUB WEBHOOKS PAYLOAD URL>',
  slakckbotPath: '< WEBHOOK URL PATH PROVIDED BY api.slack.com/.../incoming-webhooks >',
  telegram: 'https://api.telegram.org/< BOT ID AND API KEY >/sendMessage',
  channel: '@<TELEGRAM CHANNEL NAME>'
}