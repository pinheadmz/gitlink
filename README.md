## Relay GitHub events to a slack channel

### Setup relay server

```
git clone <this repo>
npm install
```

Make sure port `8080` is open, or change the port number in the `bweb`
options in `index.js`.

### SlackBot

Go to https://api.slack.com/apps and create a new app with the "incoming webhooks"
functionality. Slack will give you a webhook URL, paste JUST the path into `config.js`
file of this repo. It will look something like this:

`services/OWDM934WD/DWM9934KJD/idwJlWIjd992djIW99dwlIj`

### GitHub

On a repository or organization that you own, go to `Settings > webhooks` and
ADD a new webhook. Switch `content-type` to `application/json` and enter a 
`Payload URL`:

1. Generate a STRONG API-KEY. Paste that into `config.js` in this repo.

2. Combine that with the IP address of your Gitlink server in "Basic Auth" format.

Example:

`http://x:EHFI89238UFKUh9238KFKJ3298kfjkewKUSHEF38925@100.200.100.10:8080`
