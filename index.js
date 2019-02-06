'use strict';

const bweb = require('bweb');
const { Client } = require('bcurl');
const { password, slakckbotPath } = require('./config');

// create server to listen for webhooks
const server = bweb.server({
  host: '0.0.0.0',
  port: 8080,
  sockets: false
});

server.use(server.basicAuth({
  password: password
}));
server.use(server.bodyParser({
  type: 'json'
}));
server.use(server.router());

server.on('error', (err) => {
  console.error(err.stack);
});

server.post('/', (req, res) => {
  const { body } = req;
  handleMessage(body);
  res.send(200, 'ok', 'html');
});

server.open();


// handle messages
function handleMessage(body) {
  const keys = Object.keys(body);
  const action = body.action;

  console.log(`Received JSON with: ${keys}`)

  if (keys.indexOf('comment') !== -1)
    handleComment(body, action);
  else if (keys.indexOf('pull_request') !== -1)
    handlePR(body, action);
  else if (keys.indexOf('issue') !== -1)
    handleIssue(body, action);
  else
    return false;
}

function handleComment(body, action) {
  const url = body.issue.html_url;
  const user = body.issue.user.login;
  const title = body.issue.title;
  const msg = body.comment.body;
  const thing = body.issue.pull_request ? 'pull request' : 'issue';

  slack(`\n:speech_balloon: ${user} commented on ${thing} "${title}":\n${msg}\n${url}`)
}

function handlePR(body, action) {
  const url = body.pull_request.html_url;
  const user = body.pull_request.user.login;
  const title = body.pull_request.title;
  const msg = body.pull_request.body;

  if (action !== 'closed')
    slack(`:leftwards_arrow_with_hook: ${user} ${action} a pull request: "${title}"\n${msg}\n${url}`)
  else
    slack(`:white_check_mark: ${user} ${action} a pull request: "${title}"\n${url}`)
}

function handleIssue(body, action) {
  const url = body.issue.html_url;
  const user = body.issue.user.login;
  const title = body.issue.title;
  const msg = body.issue.body;

  if (action !== 'closed')
    slack(`:warning: ${user} ${action} an issue: "${title}"\n${msg}\n${url}`)
  else
    slack(`:white_check_mark: ${user} ${action} an issue: "${title}"\n${url}`)
}


// send messages to slackbot
const curlClient = new Client({
  path: slakckbotPath,
  host: 'hooks.slack.com'
});

async function slack(msg) {
  try {
    await curlClient.post('/', {"text": msg});
  } catch (e) {
    ;
  }
}
