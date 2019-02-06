'use strict';

const bweb = require('bweb');
const { Client } = require('bcurl');
const { password, slakckbotPath } = require('./config');

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
  console.log(body);
  res.send(200, 'ok', 'html');
});

server.open();

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
