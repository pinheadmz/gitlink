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

  console.log(`Received JSON with: ${keys} -- action = ${action}`)
  
  if (action === 'labeled' || action === 'assigned')
    return false;

  if (keys.indexOf('changes') !== -1 || keys.indexOf('review') !== -1 )
    return false;

  if (keys.indexOf('comment') !== -1)
    handleComment(body, action);
  else if (keys.indexOf('pull_request') !== -1)
    handlePR(body, action);
  else if (keys.indexOf('issue') !== -1)
    handleIssue(body, action);
  else if (keys.indexOf('forkee') !== -1)
    handleFork(body, action);
  else
    return false;
}

function handleReview(body, action) {
  handleComment(body, action);
}

function handleComment(body, action) {  
  if (action === 'deleted')
    return false;

  let thing;
  let url;
  let title;
  let msg;
  const user = body.sender.login;
  if (body.comment) {
    msg = trimMsg(body.comment.body);
  } else {
    msg = trimMsg(body.review.body);
  }

  if (body.issue) {
    url = body.issue.html_url;
    title = body.issue.title;
    thing = body.issue.pull_request ? 'pull request' : 'issue';
  } else {
    url = body.pull_request.html_url;
    title = body.pull_request.title;
    thing = 'pull request';
  }

  if (msg.indexOf('# [Codecov]') === -1)
    slack(`\n:speech_balloon: ${user} commented on ${thing} "${title}":\n(${url})\n${msg}`);
}

function handlePR(body, action) {
  const url = body.pull_request.html_url;
  const user = body.sender.login;
  const title = body.pull_request.title;
  const msg = trimMsg(body.pull_request.body);

  if (action === 'closed' && body.pull_request.merged)
    slack(`:merged: ${user} merged a pull request: "${title}"\n(${url})`);
  else if (action === 'closed' && !body.pull_request.merged)
    slack(`:white_check_mark: ${user} ${action} a pull request: "${title}"\n(${url})`);
  else if (action === 'edited')
    slack(`:leftwards_arrow_with_hook: ${user} ${action} a pull request: "${title}"\n(${url})`);
  else if (action === 'synchronize')
    slack(`:leftwards_arrow_with_hook: ${user} synchronized a pull request: "${title}"\n(${url})`);
  else
    slack(`:leftwards_arrow_with_hook: ${user} ${action} a pull request: "${title}"\n(${url})\n${msg}`);
}

function handleIssue(body, action) {
  const url = body.issue.html_url;
  const user = body.sender.login;
  const title = body.issue.title;
  const msg = trimMsg(body.issue.body);

  if (action !== 'closed')
    slack(`:warning: ${user} ${action} an issue: "${title}"\n(${url})\n${msg}`);
  else
    slack(`:white_check_mark: ${user} ${action} an issue: "${title}"\n(${url})`);
}

function handleFork(body, action) {
  const url = body.forkee.html_url;
  const user = body.sender.login;
  const title = body.forkee.name;

  slack(`:gemini: ${user} forked: ${title}\n(${url})`);
}

function trimMsg(msg) {
  return msg.length < 500 ? msg : (msg.substring(0,500) + '\n...');
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
