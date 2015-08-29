'use strict';

var Promise = require('promise');
var WebSocket = require('websocket').w3cwebsocket;
var _ = require('lodash');

module.exports = function(url, options) {

  options = options ? options : {};
  let defaultOptions = {
    debug : false
  }
  _.extend(defaultOptions, options);

  let debug = function(o) {
    if (options.debug) {
      console.log(o);
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
          debug('Unknown Definition Exception -> ' + objectId);
        }
        return definition;
      },

      getDefinitionByName(name) {
        let definition = definitionsByName[name];

        if (_.isUndefined(definition)) {
          debug('Unknown Definition Exception -> ' + name);
        }
        return definition;
      },

      /**
       * example: 
      {
        "name":"WaypointActiveMeta",
        "description":"Meta for: \nIndicates the currently active waypoint",
        "id":514175389,
        "fields":[
          {
            "name":"periodFlight",
            "units":"ms",
            "elements":1,
            "elementsName":null,
            "options":null,
            "defaultValue":"",
          },
          [...]
        ]
      }
      */
      addDefinition(definition) {
        let d = definitionsById[definition.id];
        if (d) {
          let index = _.indexOf(definitions, d);
          definitions[index] = definition;
        } else {
          definitions.push(definition);
        }

        // update indexes
        definitionsById = _.indexBy(definitions, 'id');
        definitionsByName = _.indexBy(definitions, 'name');
      },

      defaultObject(name) {
        let definition = definitionsByName(name);
        if (!definition)
          return;

        let values = {};

        for(let field of definition.fields) {
          let value, parse = undefined, undefined;

          switch(field.type) {
            case 'uint8':
              parse = function(string) { return parseInt(string); }
            break;
            case 'int8':
              parse = function(string) { return parseInt(string); }
            break;
            case 'enum':
              parse = function(string) { return string };
            break;
            case 'float':
              parse = function(string) { return parseFloat(string) };
            break;
            default:
              throw('Unknown type:' + field.type);
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

    let detachAtIndex = function(name, index) {
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
                debug('Detaching consumed callback from ' + name);
                detachAtIndex(name, i);
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
      attach(name, callback, callCount) {
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

      detach(name, callback) {
        if (handlers[name]) {
          let h = handlers[name];

          for (let i = 0; i < h.length; i++) {
            let cb  = h[i][0];
            if (cb == callback) {
              detachAtIndex(name, i);
            }
          }
        }
      },

      attachOnce(name, callback) {
        this.attach(name, callback, 1);
      },

      each(func) {
        _.forEach(handlers, func);
      }
    }
  };

  // Abstracts a websocket to send javascript objects as skybot JSON protocol
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

      sendUpdate(name, data, instanceId) {
        let definition = definitionsStore.getDefinitionByName(name);
        if (!definition)return;

        socket.send(JSON.stringify({
          type: PACKET_TYPES.UPDATE,
          payload: {
            objectId: definition.id,
            instanceId: instanceId || 0,
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

      sendDefinition(definition) {
        definitionsStore.addDefinition(definition);
        socket.send(JSON.stringify({
          type: PACKET_TYPES.DEFINITION,
          payload: definition
        }));
      },

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
    if (this.isConnected()) {
      this.connection.sendSubscribe(name);
    }
  }.bind(client), function(name) {
    if (this.isConnected()) {
      this.connection.sendUnsubscribe(name);
    }
  }.bind(client));

  client.readyCallbacks = [];
  client.requestHandlers = newHandlerManager();
  client.definitionHandlers = newHandlerManager();

  _.extend(client, {
    definitionsStore,

    isConnected() {
      return this.connection && this.connection.isConnected();
    },

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

        debug('received update: ' + objectId + ' ' + JSON.stringify(definition));
        if (definition) {
          this.updateHandlers.callHandlers(definition.name, update);
        }
      } else if (packet.type == this.connection.PACKET_TYPES.REQUEST) {
        let request = packet.payload;
        let objectId = request.objectId;
        let definition = definitionsStore.getDefinitionById(objectId);

        debug('received request: ' + objectId + ' ' + definition);
        if (definition) {
          this.requestHandlers.callHandlers(definition.name, request);
        }
      } else if (packet.type == this.connection.PACKET_TYPES.DEFINITION) {
        let definition = packet.payload;

        debug('received definition: ' + definition);
        definitionsStore.addDefinition(definition);
        this.definitionHandlers.callHandlers(definition.name, definition);

        // if there were registered update handlers, we send a subscribe
        if (_.contains(this.updateHandlers.registeredNames(), definition.name)) {
          this.connection.sendSubscribe(definition.name);
        }
      }
    },

    onReady(callback) {
      if (this.isConnected()) {
        callback();
        return;
      }
      this.readyCallbacks.push(callback);
    },

    makePromise(handlerManager, name, isRequest) {
      return new Promise(_.bind(function(resolve, reject) {
        let done = false;
        let fn = _.bind(function(data) {
          done = true;
          resolve(data);
        }, this);

        handlerManager.attachOnce(name, fn);
        if (isRequest) {
          this.connection.sendRequest(name);
        }

        // setup timeout cb
        setTimeout(_.bind(function() {
          if (done) {
            return;
          }
          handlerManager.detach(name, fn);
          // TODO setup proper error handling wih error codes
          reject('time out ' + name);
        }, this), 3000);

      }, this));
    },

    requireDefinitions(names) {
      let promises = names.map(function(name) {
        return this.makePromise(this.definitionHandlers, name);
      }, this);
      return Promise.all(promises);
    },

    requestValuesForUavs(names) {
      let missingDefs = names.reduce(function(current, name) {
        if (definitionsStore.getDefinitionByName(name)) {
          return current;
        }
        return current.concat(name);
      }, []);

      let promises = _.bind(function() {
        return names.map(function(name) {
          return this.makePromise(this.updateHandlers, name, true);
        }, this);
      }, this);

      if (missingDefs.length) {
        return this.requireDefinitions(missingDefs).then(function(){return Promise.all(promises())});
      }
      return Promise.all(promises());
    }

  });

  return client;
};
