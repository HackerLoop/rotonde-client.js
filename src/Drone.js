"use strict";

import _ from "lodash";

// Client
export const newClient = function(url, options) {

  options = options ? options : {};
  let defaultOptions = {
    debug : false
  }
  _.extend(options, defaultOptions);

  let debug = function(o) {
    if (options.debug) {
      (o);
    }
  };

  // stores and indexes definitions
  let definitionsStore = (function() {
    let definitions = [];

    // definitions indexing
    let definitionsById = {};
    let definitionsByName = {};

    return {
      getDefinitionById(objectId) {
        let definition = definitionsById[objectId];

        if (_.isUndefined(definition)) {
          debug("Unknown Definition Exception -> " + objectId);
        }
        return definition;
      },

      getDefinitionByName(name) {
        let definition = definitionsByName[name];

        if (_.isUndefined(definition)) {
          debug("Unknown Definition Exception -> " + name);
        }
        return definition;
      },

      addDefinition(definition) {
        definitions.push(definition);

        // update indexes
        definitionsById = _.indexBy(definitions, 'id');
        definitionsByName = _.indexBy(definitions, 'name');
      },

      defaultObject(name) {
        let definition = definitionsByName(name);
        if (!definition)return;

        let values = {};

        for(let field of definition.fields) {
          let value, parse = undefined, undefined;

          switch(field.type) {
            case "uint8":
            parse = function(string) { return parseInt(string); }
            break;
            case "int8":
            parse = function(string) { return parseInt(string); }
            break;
            case "enum":
            parse = function(string) { return string };
            break;
            case "float":
            parse = function(string) { return parseFloat(string) };
            break;
            default:
            throw("Unknown type:" + field.type);
          }

          if (field.elements > 1) {
            value = {};
            field.elementsName.forEach(function(name, index) {
              let v = field.defaultValue.split(',')[index];
              value[name] = parse(v);
            });
          } else {
            value = parse(field.defaultValue);
          }

          values[field.name] = value;
        }

        return values;
      }
    }
  })();

  // stores handlers by name, can auto remove handlers after n calls.
  // callbacks can be passed to this function, they will be called when a given name gets its first handler,
  // or when a given name removed its last handler
  let newHandlerManager = function(firstAddedCallback, lastRemovedCallback) {

    let handlers = {};

    let detachHandlerAtIndex = function(name, index) {
      let h =  handlers[name];
      h.splice(index--, 1);
      if (h.length == 0) {
        handlers[name] = null;
        if (lastRemovedCallback) {
          lastRemovedCallback(name);
        }
      }
    };

    return {
      callHandlers(name, param) {
        // Dispatch events to their callbacks
        if (handlers[name]) {
          let h = handlers[name];

          for (let i = 0; i < h.length; i++) {
            let callback  = h[i][0];
            let callCount = h[i][1];

            if (callCount > 0) {  // it's not a permanent callback
            if (--h[i][1] == 0) { // did it consumed all its allowed calls ?
              debug("Detaching consumed callback from " + name);
              detachHandlerAtIndex(name, i);
            }
          }
          callback(param);
        }
      }
    },

    registeredNames() {
      return _.keys(handlers);
    },

    // TODO use promises, ASAP
    attachHandler(name, callback, callCount) {
      if (callCount == undefined)
      callCount = -1;

      if (handlers[name] === undefined) {
        handlers[name] = [];
        if (firstAddedCallback) {
          firstAddedCallback(name);
        }
      }

      handlers[name].push([callback, callCount]);
    },

    detachHandler(name, callback) {
      let handlers =  this.handlers[name];
      for (let i = 0; i < handlers.length; i++) {
        let cb  = handlers[i][0];
        if (cb == callback) {
          detachHandlerAtIndex(name, i);
        }
      }
    },

    attachOnce(name, callback) {
      this.attachHandler(name, callback, 1);
    },

    each(func) {
      _.forEach(handlers, func);
    }
  }
};

// Abstracts a websocket to send javascript objects as inner JSON protocol
let newDroneConnection = function(ready, onmessage) {
  let connected = false;
  let socket = new WebSocket(url);
  socket.onmessage = onmessage;

  const PACKET_TYPES = {
    UPDATE: 'update',
    REQUEST: 'req',
    DEFINITION: 'def',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
  }

  socket.onopen = function(event) {
    connected = true;
    ready();
  };

  return {
    PACKET_TYPES,

    isConnected() {
      return connected;
    },

    sendUpdate(name, data) {
      let definition = definitionsStore.getDefinitionByName(name);
      if (!definition)return;

      socket.send(JSON.stringify({
        type: PACKET_TYPES.UPDATE,
        payload: {
          objectId: definition.id,
          instanceId: 0,
          data: data
        }
      }));
    },

    sendRequest(name, instanceId) {
      let definition = definitionsStore.getDefinitionByName(name);
      if (!definition)return;

      socket.send(JSON.stringify({
        type: PACKET_TYPES.REQUEST,
        payload: {
          objectId: definition.id,
          instanceId: instanceId
        }
      }));
    },

    // sendDefinition

    sendSubscribe(name) {
      let definition = definitionsStore.getDefinitionByName(name);
      if (!definition)return;

      socket.send(JSON.stringify({
        type: PACKET_TYPES.SUBSCRIBE,
        payload: {
          objectId: definition.id
        }
      }));
    },

    sendUnsubscribe(name) {
      let definition = definitionsStore.getDefinitionByName(name);
      if (!definition)return;

      socket.send(JSON.stringify({
        type: PACKET_TYPES.UNSUBSCRIBE,
        payload: {
          objectId: definition.id
        }
      }));
    }
  }
}

let client = {};
client.updateHandlers = newHandlerManager(function(name) {
  client.connection.sendSubscribe(name);
}, function(name) {
  client.connection.sendUnsubsribe(name);
});
client.readyCallbacks = [];
client.requestHandlers = newHandlerManager();
client.definitionHandlers = newHandlerManager();

_.extend(client, {
  definitionsStore,

  connect() {
    this.connection = newDroneConnection(function() {
      _.forEach(this.readyCallbacks, function(readyCallback) {
        readyCallback();
      });

      // send subsribe for all already registered updateHandlers
      this.updateHandlers.each(function(name) {
        this.connection.sendSubscribe(name);
      }.bind(this))
    }.bind(this), _.bind(this.handleMessage, this)); // benefits of _.bind over .bind() ? backward compat ?
  },

  handleMessage(event) {
    let packet = JSON.parse(event.data);

    if (packet.type == this.connection.PACKET_TYPES.UPDATE) {
      let update = packet.payload;
      let objectId = update.objectId;
      let definition = definitionsStore.getDefinitionById(objectId);
      if (definition) {
        this.updateHandlers.callHandlers(definition.name, update);
      }
    } else if (packet.type == this.connection.PACKET_TYPES.REQUEST) {
      let request = packet.payload;
      let objectId = request.objectId;
      let definition = definitionsStore.getDefinitionById(objectId);
      if (definition) {
        this.requestHandlers.callHandlers(definition.name, request);
      }
    } else if (packet.type == this.connection.PACKET_TYPES.DEFINITION) {
      let definition = packet.payload;
      definitionsStore.addDefinition(definition);

      this.definitionHandlers.callHandlers(definition.name, definition);
    }
  },

  onReady(callback) {
    if (this.connection && this.connection.isConnected()) {
      callback();
      return;
    }
    this.readyCallbacks.push(callback);
  }
});

return client;
};
