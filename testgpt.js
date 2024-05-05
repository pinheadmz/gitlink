'use strict';

const moderate = require('./index.js');

moderate(
  'https://not.a.real.url',
  'The code changes are ok but I think the author is a racist.',
  false);

