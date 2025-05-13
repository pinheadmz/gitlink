/* eslint max-len: off */
'use strict';

const irc = require('irc-upd');
const request = require('request');
const bweb = require('bweb');
const { Client } = require('bcurl');
const {
  password,
  slakckbotPath,
  port,
  telegrambot,
  modbot,
  modchat,
  gptapikey,
  gptasst,
  // eslint-disable-next-line camelcase
  chat_id,
  irc: ircConfig
} = require('./config');

// ** CUSTOM SETTINGS **
const ignoreActions = [
  'synchronize',
  'unlabeled',
  'labeled',
  'assigned',
  'unassigned',
  'review_requested',
  'review_request_removed',
  'deleted',
  'milestoned',
  'demilestoned',
  'locked',
  'unlocked'
];

const ignoreKeys = [
  'changes'
];
// *********************

let server, IRCCLIENT;

if (require.main === module) {
  // Create server to listen for webhooks
  server = bweb.server({
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

  IRCCLIENT = new irc.Client(ircConfig.server, ircConfig.nick, {
      channels: [ircConfig.channel],
      userName: ircConfig.user,
      realName: ircConfig.nick,
      nick: ircConfig.nick,
      password: ircConfig.password,
      debug: false,
      showErrors: true,
      autoRejoin: true,
      sasl: true
  });

  IRCCLIENT.addListener('join', (message='') => {
      console.log('Joined IRC channel', message);
  });

  IRCCLIENT.addListener('error', (message='') => {
      console.log('IRC error:', message);
  });
  IRCCLIENT.addListener('register', (message='') => {
      console.log('register:', message);
  });

  IRCCLIENT.addListener('message', (from='', to='', message='') => {
      console.log('IRC message:', from, to, message);
  });
}

// send messages to slackbot
const curlClient = new Client({
  path: slakckbotPath,
  host: 'hooks.slack.com'
});

async function slack(msg) {
  // console.log(`  "${msg.substr(0, 80)}"`);

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
    console.log(`telegram error: ${e}`);
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
        console.error('telegram error:', error);
    }
  );
}

function moderate(url, prompt, hunk = '', telegram = true) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${gptapikey}`,
    'OpenAI-Beta': 'assistants=v2'
  };

  if (hunk.length) {
    hunk += '\n\n';
  }

  let line = '';
  request.post(
    {
      url: 'https://api.openai.com/v1/threads/runs',
      headers,
      json: true,
      body: {
        stream: true,
        assistant_id: gptasst,
        thread: {
          'messages': [{role: 'user', content: hunk + prompt}]
        }
      }
    }
  )
  .on('error', e => console.log(e))
  .on('data', (chunk) => {
    line += chunk.toString('ascii');
  })
  .on('end', () => {
    let answer;
    try {
      const parts = line.split('\n');
      const eventIndex = parts.indexOf('event: thread.message.completed');
      if (eventIndex === -1)
        throw new Error('No thread.message.completed event');
      const data = parts[eventIndex + 1];
      const json = data.split('data:')[1];
      answer = JSON.parse(json).content[0].text.value;
    } catch (e) {
      console.log('Unable to parse GPT response due to error:');
      console.log(e);
      console.log('Complete GPT run:');
      console.log(line);
      return;
    }

    console.log(`  moderation answer: ${answer}\n`);

    if (answer.startsWith('OK') || !telegram)
      return;

    const data = ({
      chat_id: modchat,
      text: `${answer}:\n${url}\n${trimMsg(prompt)}`,
      disable_web_page_preview: 'true'
    });
    request.post(
      modbot,
      {
        json: true,
        body: data
      },
      (error, response, body) => {
        if (error) {
          console.error(' modchat error:', error);
        }
      }
    );
  });
}

function sendirc(msg) {
  try {
    IRCCLIENT.say(ircConfig.channel, msg);
  } catch (e) {
    console.log(`send irc failed: ${e}`);
  }
}

// Handle all incoming messages
function handleMessage(body) {
  const keys = Object.keys(body);
  const action = body.action;

  console.log(`Keys: ${keys}`);
  console.log(` Action: ${action}`);

  // Ignore private repos
  if (body.repository.private) {
    console.log(` Ignoring private repo: ${body.repository.name}`);
    return;
  }

  // Ignore some actions
  if (ignoreActions.indexOf(action) !== -1) {
    console.log(` Ignoring action: ${action}`);
    return;
  }

  // Ignore some payloads (detected by containing certain keys)
  for (const key of ignoreKeys) {
    if (keys.indexOf(key) !== -1) {
      console.log(` Ignoring payload with key: ${key}`);
      return;
    }
  }

  // Ignore bot
  if (body && body.sender && body.sender.login === 'DrahtBot') {
    console.log(' Ignoring DrahtBot');
    return;
  }

  // Special case for GUI repo
  const isGUI = (body.repository && body.repository.full_name === 'bitcoin-core/gui');
  if (isGUI)
    console.log(' Repo is GUI');

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
  else if (keys.indexOf('base_ref') !== -1 && !isGUI)
    handlePush(body);
  else
    return;
}

function handlePush(body) {
  console.log(' Ignoring push-commits');
  return;
}

function handleReview(body, action) {
  console.log(' Handling review');
  const user = body.sender.login;
  const title = body.pull_request.title;
  let url = body.pull_request.html_url;
  let msg = '';
  let prompt =  '';
  let hunk = '';

  // Comment text is either in a "comment" or a "review" object
  if (body.comment) {
    if (body.comment.diff_hunk) {
      hunk += body.comment.diff_hunk + '\n--\n';
    }

    if (body.comment.body) {
      console.log('  body comment');
      msg += trimMsg(body.comment.body);
      prompt += body.comment.body;

      if (body.comment.html_url)
        url = body.comment.html_url;
    }
  }

  if (body.review && body.review.body) {
    console.log('  body review');
    msg += trimMsg(body.review.body);
    prompt += body.review.body;

    if (body.review.html_url)
      url = body.review.html_url;
  }

  if (!msg.length) {
    console.log('  Ignoring empty msg');
    return;
  }

  moderate(url, prompt, hunk);

  if (action === 'submitted') {
    switch (body.review.state) {
      case 'approved':
        slack(`:thumbsup: ${user} approved a pull request: "${title}"\n(${url})\n${msg}`);
        break;
      case 'changes_requested':
        slack(`:thinking_face: ${user} requested changes to a pull request: "${title}"\n(${url})\n${msg}`);
        break;
      case 'commented':
        slack(`:thinking_face: ${user} reviewed a pull request: "${title}"\n(${url})\n${msg}`);
        break;
      default:
        slack(`${user} ${body.review.state} to a pull request: "${title}"\n(${url})\n${msg}`);
    }
  } else {
    console.log('  review action is not "submitted"');
  }
}

function handleComment(body, action) {
  console.log(' Handling comment');
  const user = body.sender.login;

  let thing;
  let url;
  let title;
  let msg = '';
  let prompt = '';
  let hunk = '';

  // Comment text is either in a "comment" or a "review" object
  if (body.comment) {
    if (body.comment.diff_hunk) {
      hunk += body.comment.diff_hunk + '\n--\n';
    }

    if (body.comment.body) {
      console.log('  body comment');
      msg += trimMsg(body.comment.body);
      prompt += body.comment.body;

      if (body.comment.html_url)
        url = body.comment.html_url;
    }
  }

  if (body.review && body.review.body) {
    console.log('  body review');
    msg += trimMsg(body.review.body);
    prompt += body.review.body;
  }

  // What's being commented ON is either an issue or a pull request
  if (body.issue) {
    // Comments on issues or PRs get caught here...
    url = body.comment.html_url;
    title = body.issue.title;
    thing = body.issue.pull_request ? 'pull request' : 'issue';
  } else if (body.pull_request) {
    // ...but PR "review" comments get caught here
    url = body.comment.html_url;
    title = body.pull_request.title;
    thing = 'pull request';
  } else {
    // Misc comments like on commits
    url = body.comment.html_url;
    title = '';
    thing = 'something';
  }

  moderate(url, prompt, hunk);

  slack(
    `:speech_balloon: ${user} commented on ${thing} "${title}":\n(${url})\n${msg}`);
}

function handlePR(body, action) {
  console.log(' Handling PR');
  const url = body.pull_request.html_url;
  const title = body.pull_request.title;

  const user = body.sender.login;

  const msg = trimMsg(body.pull_request.body);
  const prompt = body.pull_request.body;

  switch(action) {
    case 'closed':
      if (body.pull_request.merged) {
        slack(`:merged: ${user} merged a pull request: "${title}"\n(${url})`);
        sendirc(`${user} merged pull request: "${title}" (${url})`);
      } else {
        slack(`:white_check_mark: ${user} closed a pull request: "${title}"\n(${url})`);
        sendirc(`${user} closed pull request: "${title}" (${url})`);
      }
      break;
    case 'edited':
      slack(`:leftwards_arrow_with_hook: ${user} edited a pull request: "${title}"\n(${url})`);
      break;
    case 'synchronize':
      slack(`:leftwards_arrow_with_hook: ${user} synchronized a pull request: "${title}"\n(${url})`);
      break;
    case 'ready_for_review':
      slack(`:wave: ${user}'s pull request is ready for review: "${title}"\n(${url})`);
      break;
    case 'opened':
      slack(`:memo: ${user} opened a pull request: "${title}"\n(${url})\n${msg}`);
      sendirc(`${user} opened pull request: "${title}" (${url})`);
      moderate(url, prompt);
      break;
    default:
      slack(`:memo: ${user} ${action} a pull request: "${title}"\n(${url})\n${msg}`);
      break;
  }
}

function handleIssue(body, action) {
  console.log(' Handling issue');
  const url = body.issue.html_url;
  const title = body.issue.title;

  const user = body.sender.login;

  const msg = trimMsg(body.issue.body);
  const prompt = body.issue.body;

  switch (action) {
    case 'closed':
      slack(`:white_check_mark: ${user} closed an issue: "${title}"\n(${url})`);
      break;
    case 'locked':
      slack(`:lock: ${user} locked an issue: "${title}"\n(${url})`);
      break;
    case 'unlocked':
      slack(`:unlock: ${user} unlocked an issue: "${title}"\n(${url})`);
      break;
    default:
      slack(`:warning: ${user} ${action} an issue: "${title}"\n(${url})\n${msg}`);
      moderate(url, prompt);
      break;
  }
}

function handleFork(body, action) {
  console.log(' Handling fork;)');
  const url = body.forkee.html_url;
  const title = body.forkee.name;

  const user = body.sender.login;

  slack(`:gemini: ${user} forked: ${title}\n(${url})`);
}

function trimMsg(msg) {
  if (msg)
    return msg.length < 500 ? msg : (msg.substring(0,500) + '\n...');
  else
    return '';
}

module.exports = moderate;
