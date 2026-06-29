'use strict';

const APP_MODE = (process.env.APP_MODE || 'full').toLowerCase();

function isPlanetiveMode() {
  return APP_MODE === 'planetive';
}

module.exports = { APP_MODE, isPlanetiveMode };
