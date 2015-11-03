'use strict';

const
  Promise = require('promise'),
  WebSocket = require('websocket').w3cwebsocket,
  _ = require('lodash');

// stores and indexes definitions
let newDefinitionsStore = () => {
  let definitions = [];

  // definitions indexing
  let definitionsByIdentifier = {};

  return {
    forEach(fn) {
      _.forEach(definitions, fn);
    },

    getDefinition(identifier) {
      let definition = definitionsByIdentifier[identifier];

      if (_.isUndefined(definition)) {
        console.log('Unknown Definition Exception -> ' + identifier);
      }
      return definition;
    },

    addDefinition(definition) {
      let d = definitionsByIdentifier[definition.identifier];
      if (d) {
        let index = _.indexOf(definitions, d);
        let fields = _.uniq(_.union(d.fields, definition.fields), function(field) {
          return field.name;
        });
        definition.fields = fields;
        definitions[index] = definition;
      } else {
        definitions.push(definition);
      }

      // update indexes
      definitionsByIdentifier = _.indexBy(definitions, 'identifier');
    },

    removeDefinition(identifier) {
      let index = _.indexOf(definitions, identifier);
      if (index < 0) {
        return;
      }
      definitions.splice(index, 1);

      definitionsByIdentifier = _.indexBy(definitions, 'identifier');
    },
  };
};

// stores handlers by identifier, can auto remove handlers after n calls.
// callbacks can be passed to this function, they will be called when a given identifier gets its first handler,
// or when a given identifier removed its last handler
let newHandlerManager = (firstAddedCallback, lastRemovedCallback) => {

  let handlers = new Map();

  let detachAtIndex = function(identifier, index) {
    let h =  handlers[identifier];
    h.splice(index--, 1);

    if (h.length == 0) {
      handlers[identifier] = undefined;
      if (lastRemovedCallback) {
        lastRemovedCallback(identifier);
      }
    }
  };

  return {

    makePromise(identifier, timeout) {
      return new Promise((resolve, reject) => {
        let timer;
        let fn = (data) => {
          resolve(data);
          if (timer) {
            clearTimeout(timer);
          }
        };

        this.attachOnce(identifier, fn);

        if (!timeout) {
          return;
        }

        timer = setTimeout(() => {
          this.detach(identifier, fn);
          // TODO setup proper error handling wih error codes
          reject('time out ' + identifier);
        }.bind(this), timeout);

      });
    },

    callHandlers(identifier, param) {
      // Dispatch events to their callbacks
      if (handlers[identifier]) {
        let h = handlers[identifier];

        for (let i = 0; i < h.length; i++) {
          let callback  = h[i][0];
          let callCount = h[i][1];

          if (callCount > 0) {  // it's not a permanent callback
            if (--h[i][1] == 0) { // did it consumed all its allowed calls ?
              console.log('Detaching consumed callback from ' + identifier);
              detachAtIndex(identifier, i);
            }
          }
          callback(param);
        }
      }
    },

    registeredIdentifiers() {
      return _.keys(handlers);
    },

    attach(identifier, callback, callCount) {
      if (callCount == undefined)
        callCount = -1;

      if (handlers[identifier] === undefined) {
        handlers[identifier] = [];

        if (firstAddedCallback) {
          firstAddedCallback(identifier);
        }
      }
      handlers[identifier].push([callback, callCount]);
    },

    detach(identifier, callback) {
      if (handlers[identifier]) {
        let h = handlers[identifier];

        for (let i = 0; i < h.length; i++) {
          let cb  = h[i][0];
          if (cb == callback) {
            detachAtIndex(identifier, i);
          }
        }
      }
    },

    detachAll() {
      for(let identifier of handlers.keys()) {
        for(let i = 0; i < handlers[identifier].length; i++) {
          detachAtIndex(identifier, i);
        }
      }
    },

    attachOnce(identifier, callback) {
      this.attach(identifier, callback, 1);
    },

    each(func) {
      _.forEach(handlers, func);
    }
  }
};

// Abstracts a websocket to send javascript objects as skybot JSON protocol
let newRotondeConnection = function(url, ready, onmessage) {
  let connected = false;
  let socket = new WebSocket(url);

  socket.onmessage = onmessage;

  const PACKET_TYPES = {
    ACTION: 'action',
    EVENT: 'event',
    DEFINITION: 'def',
    UNDEFINITION: 'undef',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
  }

  socket.onopen = (event) => {
    connected = true;
    ready();
  };

  return {
    PACKET_TYPES,

    isConnected() {
      return connected;
    },

    sendEvent(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.EVENT,
        payload: {
          identifier,
          data,
        },
      }));
    },

    sendAction(identifier, data) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.ACTION,
        payload: {
          identifier,
          data,
        },
      }));
    },

    sendDefinition(definition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.DEFINITION,
        payload: definition,
      }));
    },

    sendUnDefinition(unDefinition) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNDEFINITION,
        payload: unDefinition,
      }));
    },

    sendSubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.SUBSCRIBE,
        payload: {
          identifier,
        },
      }));
    },

    sendUnsubscribe(identifier) {
      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNSUBSCRIBE,
        payload: {
          identifier,
        },
      }));
    }
  }
}


module.exports = (url) => {

  let connection;

  let localDefinitions = {action: newDefinitionsStore(), event: newDefinitionsStore()};
  let remoteDefinitions = {action: newDefinitionsStore(), event: newDefinitionsStore()};

  let searchDefinitions = (definitionsStore, identifier) => {
    return _.compact([definitionsStore['action'].getDefinition(identifier), definitionsStore['event'].getDefinition(identifier)]);
  };

  let eventHandlers = newHandlerManager((identifier) => {
    if (isConnected()) {
      connection.sendSubscribe(identifier);
    }
  }, (identifier) => {
    if (isConnected()) {
      connection.sendUnsubscribe(identifier);
    }
  });
  let actionHandlers = newHandlerManager(() => {}, () => {});
  let definitionHandlers = newHandlerManager(() => {}, () => {});
  let unDefinitionHandlers = newHandlerManager(() => {}, () => {});

  let readyCallbacks = [];

  let isConnected = () => {
    return connection && connection.isConnected();
  };

  let getRemoteDefinition = (type, identifier) => remoteDefinitions[type].getDefinition(identifier);
  let getLocalDefinition = (type, identifier) => localDefinitions[type].getDefinition(identifier);;

  let addLocalDefinition = (type, identifier, fields) => {
    let definition = {
      identifier,
      type,
      fields,
    };
    localDefinitions[type].addDefinition(definition);
    if (isConnected()) {
      connection.sendDefinition(definition);
    }
  };

  let removeLocalDefinition = (type, identifier) => {
    let definition = localDefinitions[type].getDefinition(identifier);
    if (!definition) {
      return;
    }
    localDefinitions[type].removeDefinition(identifier);
    if (isConnected()) {
      connection.sendUnDefinition(definition);
    }
  };

  let connect = () => {
    connection = newRotondeConnection(url, () => {
      _.forEach(readyCallbacks, (readyCallback) => {
        readyCallback();
      });

      // send subsribe for all already registered updateHandlers
      eventHandlers.each((identifier) => {
        connection.sendSubscribe(identifier);
      });

      // send local definitions
      _.forEach(['action', 'event'], (type) => {
        localDefinitions[type].forEach((definition) => {
          connection.sendDefinition(definition);
        })
      });
    }, handleMessage);
  };

  let handleMessage = (event) => {
    let packet = JSON.parse(event.data);

    if (packet.type == connection.PACKET_TYPES.EVENT) {
      let event = packet.payload;
      let identifier = event.identifier;

      console.log('received event: ' + identifier);
      eventHandlers.callHandlers(identifier, event);
    } else if (packet.type == connection.PACKET_TYPES.ACTION) {
      let action = packet.payload;
      let identifier = action.identifier;

      console.log('received action: ' + identifier);
      actionHandlers.callHandlers(identifier, request);
    } else if (packet.type == connection.PACKET_TYPES.DEFINITION) {
      let definition = packet.payload;

      console.log('received definition: ' + definition.identifier + ' ' + definition.type);
      remoteDefinitions[definition.type].addDefinition(definition);
      definitionHandlers.callHandlers(definition.identifier, definition);

      if (definition.type == 'event') {
        // if there were registered update handlers, we send a subscribe
        if (_.contains(eventHandlers.registeredIdentifiers(), definition.identifier)) {
          connection.sendSubscribe(definition.identifier);
        }
      }
    } else if (packet.type == connection.PACKET_TYPES.UNDEFINITION) {
      let unDefinition = packet.payload;

      console.log('received unDefinition: ' + unDefinition.identifier + ' ' + definition.type);
      remoteDefinitions[definition.type].removeDefinition(unDefinition.identifier);
      unDefinitionHandlers.callHandlers(unDefinition.identifier, unDefinition);
    }
  };

  let onReady = (callback) => {
    if (isConnected()) {
      callback();
      return;
    }
    readyCallbacks.push(callback);
  };

  let requireDefinitions = (identifiers, timeout) => {
    let promises = identifiers.map((identifier) => {
      return definitionHandlers.makePromise(identifier, timeout);
    });
    return Promise.all(promises);
  };

  let bootstrap = (actions, events, defs, timeout) => {
    let missingDefs = _.uniq(_.union(_.keys(actions), events, defs).reduce((current, identifier) => {
      if (searchDefinitions(remoteDefinitions, identifier).length > 0) {
        return current;
      }
      current.push(identifier);
      return current;
    }, []));

    let promises = () => events.map((identifier) => {
      _.forEach(actions, (action, identifier) => {
        connection.sendAction(identifier, action);
      });
      return eventHandlers.makePromise(identifier, timeout);
    });

    if (missingDefs.length) {
      return requireDefinitions(missingDefs, timeout).then(() => Promise.all(promises()));
    }
    return Promise.all(promises());
  };

  return {
    addLocalDefinition,
    removeLocalDefinition,

    sendEvent: (identifier, data) => client.sendEvent(identifier, data),
    sendAction: (identifier, data) => client.sendAction(identifier, data),

    eventHandlers,
    actionHandlers,
    definitionHandlers,
    unDefinitionHandlers,

    getRemoteDefinition,
    getLocalDefinition,
    isConnected,
    connect,
    onReady,
    requireDefinitions,
    bootstrap,
  };
};
