'use strict';

const request = require('request');
const bweb = require('bweb');
const { Client } = require('bcurl');
const {
  password,
  slakckbotPath,
  port,
  telegrambot,
  chat_id,
} = require('./config');

// ** CUSTOM SETTINGS **
const ignoreActions = [
  'unlabeled',
  'labeled',
  'assigned',
  'unassigned',
  'review_requested',
  'deleted',
  'milestoned',
  'demilestoned'
];

const ignoreKeys = [
  'changes'
];
// *********************

// Create server to listen for webhooks
const server = bweb.server({
  host: '0.0.0.0',
  port,
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

// send messages to slackbot
const curlClient = new Client({
  path: slakckbotPath,
  host: 'hooks.slack.com'
});

async function slack(msg) {
  try {
    msg = msg.replace(':eight_spoked_asterisk:', '✳️');
    msg = msg.replace(':thumbsup:', '👍');
    msg = msg.replace(':thinking_face:', '🤔');
    msg = msg.replace(':merged:', '🚀');
    msg = msg.replace(':white_check_mark:', '✅');
    msg = msg.replace(':leftwards_arrow_with_hook:', '↩️');
    msg = msg.replace(':wave:', '👋');
    msg = msg.replace(':memo:', '📝');
    msg = msg.replace(':locked:', '🔒');
    msg = msg.replace(':unlocked:', '🔓');
    msg = msg.replace(':unlock:', '🔓');
    msg = msg.replace(':warning:', '⚠️');
    msg = msg.replace(':gemini:', '♊️');
    msg = msg.replace(':speech_balloon:', '💬');

    telegram(msg);
  } catch (e) {
    ;
  }

  try {
    await curlClient.post('/', {'text': msg});
  } catch (e) {
    ;
  }
}

function telegram(msg) {
  const data = ({
    chat_id,
    text: msg,
    disable_web_page_preview: 'true'
  });

  request.post(
    telegrambot,
    {
      json: true,
      body: data
    },
    (error, response, body) => {
      if (error)
        console.error('error:', error);
    }
  );
}

// Handle all incoming messages
function handleMessage(body) {
  const keys = Object.keys(body);
  const action = body.action;

  console.log(`Received JSON with: ${keys} -- action = ${action}`);

  // Ignore private repos
  if (body.repository.private) {
    console.log(`Ignoring private repo: ${body.repository.name}`);
    return;
  }

  // Ignore some actions
  if (ignoreActions.indexOf(action) !== -1)
    return;

  // Ignore some payloads (detected by containing certain keys)
  for (const key of ignoreKeys) {
    if (keys.indexOf(key) !== -1)
      return;
  }

  // Only way to know what type of payload GitHub sent us is to check all the
  // keys in the object. Some have more than one so we need to check in order.
  if (keys.indexOf('comment') !== -1)
    handleComment(body, action);
  else if (keys.indexOf('review') !== -1)
    handleReview(body, action);
  else if (keys.indexOf('pull_request') !== -1)
    handlePR(body, action);
  else if (keys.indexOf('issue') !== -1)
    handleIssue(body, action);
  else if (keys.indexOf('forkee') !== -1)
    handleFork(body, action);
  else if (keys.indexOf('base_ref') !== -1)
    handlePush(body);
  else
    return;
}

function handlePush(body) {
  if (body.deleted)
    return;

  const ref = body.ref.split('/').slice(-1)[0];
  const repo = body.repository.full_name;
  const msg = body.head_commit.message;
  const user = body.sender.login;
  const url = body.compare;

  slack(
    `:eight_spoked_asterisk: ${user} pushed commits to a branch:`
    + ` ${repo}:${ref}\n(${url})\n${msg}`);
}

function handleReview(body, action) {
  const user = body.sender.login;
  const url = body.pull_request.html_url;
  const title = body.pull_request.title;

  if (action === 'submitted' && body.review.state === 'approved') {
    slack(`:thumbsup: ${user} approved a pull request: "${title}"\n(${url})`);
  } else if (
      action === 'submitted'
      && body.review.state === 'changes_requested') {
    slack(
      `:thinking_face: ${user} requested changes to a pull request:`
      + ` "${title}"\n(${url})`);
  }
}

function handleComment(body, action) {
  const user = body.sender.login;

  let thing;
  let url;
  let title;
  let msg;

  // Comment text is either in a "comment" or a "review" object
  if (body.comment) {
    msg = trimMsg(body.comment.body);
  } else {
    msg = trimMsg(body.review.body);
  }

  // What's being commented ON is either an issue or a pull request
  if (body.issue) {
    // Comments on issues or PRs get caught here...
    url = body.comment.html_url;
    title = body.issue.title;
    thing = body.issue.pull_request ? 'pull request' : 'issue';
  } else {
    // ...but PR "review" comments get caught here
    url = body.comment.html_url;
    title = body.pull_request.title;
    thing = 'pull request';
  }

  // Ignore comments from the CI
  if (
    msg.indexOf('# [Codecov]') === -1 &&
    msg.indexOf('## Pull Request Test Coverage Report') === -1
  ) {

    slack(
      `:speech_balloon: ${user} commented on ${thing}`
      + ` "${title}":\n(${url})\n${msg}`);
  }
}

function handlePR(body, action) {
  const url = body.pull_request.html_url;
  const title = body.pull_request.title;

  const user = body.sender.login;

  const msg = trimMsg(body.pull_request.body);

  switch(action) {
    case 'closed':
      if (body.pull_request.merged) {
        slack(`:merged: ${user} merged a pull request: "${title}"\n(${url})`);
      } else {
        slack(
          `:white_check_mark: ${user} closed a pull request:`
          + ` "${title}"\n(${url})`);
      }
      break;
    case 'edited':
      slack(
        `:leftwards_arrow_with_hook: ${user} edited a pull request:`
        + ` "${title}"\n(${url})`);
      break;
    case 'synchronize':
      slack(
        `:leftwards_arrow_with_hook: ${user} synchronized a pull request:`
        + ` "${title}"\n(${url})`);
      break;
    case 'ready_for_review':
      slack(
        `:wave: ${user}'s pull request is ready for review:`
        + ` "${title}"\n(${url})`);
      break;
    default:
      slack(
        `:memo: ${user} ${action} a pull request:`
        + ` "${title}"\n(${url})\n${msg}`);
      break;
  }
}

function handleIssue(body, action) {
  const url = body.issue.html_url;
  const title = body.issue.title;

  const user = body.sender.login;

  const msg = trimMsg(body.issue.body);

  switch (action) {
    case 'closed':
      slack(
        `:white_check_mark: ${user} closed an issue:`
        + ` "${title}"\n(${url})`);
      break;
    case 'locked':
      slack(
        `:lock: ${user} locked an issue:`
        + ` "${title}"\n(${url})`);
      break;
    case 'unlocked':
      slack(
        `:unlock: ${user} unlocked an issue:`
        + ` "${title}"\n(${url})`);
      break;
    default:
      slack(
        `:warning: ${user} ${action} an issue:`
        + ` "${title}"\n(${url})\n${msg}`);
      break;
  }
}

function handleFork(body, action) {
  const url = body.forkee.html_url;
  const title = body.forkee.name;

  const user = body.sender.login;

  slack(`:gemini: ${user} forked: ${title}\n(${url})`);
}

function trimMsg(msg) {
  return msg.length < 500 ? msg : (msg.substring(0,500) + '\n...');
}
