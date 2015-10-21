'use strict';

let newClient = require('../src/Client');

let client = newClient('ws://localhost:4224/');

let testaction = {
  identifier: 'testaction',
  data: {
    field1: 750497594.8804686,
    field2: 'string test',
    field3: false,
  },
};

client.onReady(() => {
  client.bootstrap({testaction}, ['testevent'], 1000).then(() => {
    console.log('onready');
  }, (error) => {
    console.log('error', error);
  });
});

client.connect();
