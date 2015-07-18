"use strict";

import _ from "lodash";

var debug = function(o) {
    if (this.options.debug) {
      console.log(o);
    }
};

var definitions = [];

 // definitionsById cache
var definitionsById = {};
var getDefinitionsById = function(objectId) {
    var definition = getDefinitionsById[objectId];

    if (_.isUndefined(definition)) {
      throw "Unknown Definition Exception -> " + name;
    }
    return definition;
};

 // definitionsByName cache
var definitionsByName = {};
var getDefinitionsByName = function(name) {
    var definition = definitionsByName[name];

    if (_.isUndefined(definition)) {
      throw "Unknown Definition Exception -> " + name;
    }
    return definition;
};

// definitions manipulation
function addDefinition(definition) {
    definitions.push(definition);
    definitionsById = _.indexBy(definitions, 'id');
    definitionsByName = _.indexBy(definitions, 'name');
}

/**
 * general purpose handler manager
 */
var newHandlerManager = function() {

    // Handlers that will be attached to UavObjects
    var handlers = {};

    var detachHandlerAtIndex = function(name, index) {
        if (_.contains(_.keys(definitionsByName), name) == false) {
            var handlers =  this.handlers[name];
            handlers.splice(index--, 1);
            if (handlers.length == 0) {
                this.handlers[name] = null;
                this.sendUnsubsribe(name);
            }
        } else {
            throw("Unknown Uav handler");
        }
    };

    return {
        callHandlers: function(name) {
            // Dispatch events to their callbacks
            if (handlers[uavObject.name]) {
              var handlers = handlers[uavObject.name];

              for (var i = 0; i < handlers.length; i++) {
                var callback  = handlers[i][0];
                var callCount = handlers[i][1];

                if (callCount > 0) {  // it's not a permanent callback
                  if (--handlers[i][1] == 0) { // did it consumed all its allowed calls ?
                    debug("Detaching consumed callback from " + uavObject.name);
                    detachHandlerAtIndex(uavObject.name, i);
                  }
                }
                callback(uavObject);
              }
            }
        },

        // TODO use promises, ASAP
        attachHandler: function(name, callback, callCount) {
          if (callCount == undefined)
            callCount = -1;

          if (_.contains(_.keys(definitionsByName), name)) {
            if (this.handlers[name] === undefined) {
              this.handlers[name] = [];
              this.sendSubscribe(name);
            }

            this.handlers[name].push([callback, callCount]);
          } else {
            throw("Unknown Uav handler");
          }
      },

        detachHandler: function(name, callback) {
            if (_.contains(_.keys(definitionsByName), name) == false) {
                var handlers =  this.handlers[name];
                for (var i = 0; i < handlers.length; i++) {
                    var cb  = handlers[i][0];
                    if (cb == callback) {
                        detachHandlerAtIndex(name, i);
                    }
                }
            } else {
                throw("Unknown Uav handler");
            }
        },

        attachOnce: function(name, callback) {
          this.attachHandler(name, callback, 1);
        }
    }
};

var sendUpdate = function(name, data) {
  var definition = getDefinitionsByName(name);

  this.socket.send(JSON.stringify({
      type: Drone.REQUEST_TYPES.UPDATE,
      payload: {
          objectId: definition.id,
          instanceId: 0,
          data: data
      }
  }));
};

var sendRequest = function(name, instanceId) {
    var definition = getDefinitionsByName(name);

    this.socket.send(JSON.stringify({
      type: Drone.REQUEST_TYPES.REQUEST,
      payload: {
          objectId: definition.id,
          instanceId: instanceId
      }
  }));
};

var sendSubsribe = function(name) {
    var definition = getDefinitionsByName(name);

    this.socket.send(JSON.stringify({
      type: Drone.REQUEST_TYPES.SUBSCRIBE,
      payload: {
          objectId: definition.id
      }
  }));
};

var sendUnsubsribe = function(name) {
    var definition = getDefinitionsByName(name);

    this.socket.send(JSON.stringify({
        type: Drone.REQUEST_TYPES.UNSUBSCRIBE,
        payload: {
            objectId: definition.id
        }
    }));
};

export class Drone {
  constructor(url, options) {
    this.url = url;

    this.readyCallbacks = [];

    this.options = {
      debug: false
    }
    _.extend(this.options, options);

    this.updateHandlers = newHandlerManager();
    this.requestHandlers = newHandlerManager();
    this.definitionHandlers = newHandlerManager();
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = _.bind(this.handleMessage, this);

    this.socket.ononopen = function(event) {
        this.connected = true;
        _.forEach(this.readyCallbacks, function(index, readyCallback) {
            readyCallback();
        });
    };
  }

  isConnected() {
    return this.connected;
  }

  readUav(name, callback) {
    sendRequest(name);
    this.updateHandlers.attachOnce(name, callback);
  }

  handleMessage(event) {
    var packet = JSON.parse(event.data);

    if (packet.type == Drone.REQUEST_TYPES.UPDATE) {
        var update = packet.payload;
        var objectId = update.objectId;
        var definition = definitionsById[objectId];
        if (_.isUndefined(definition) == false) {
            this.updateHandlers.callHandlers(definition.name);
        }
    } else if (packet.type == Drone.REQUEST_TYPES.REQUEST) {
        var request = packet.payload;
        var objectId = request.objectId;
        var definition = definitionsById[objectId];
        if (_.isUndefined(definition) == false) {
            this.requestHandlers.callHandlers(definition.name);
        }
    } else if (packet.type == Drone.REQUEST_TYPES.DEFINITION) {
        var definition = packet.payload;
        addDefinition(definition);

        this.definitionHandlers.callHandlers(definition.name);
    }
  }

  attachUpdateHandler(name, callback, callCount) {
      this.updateHandlers.attachHandler(name, callback, callCount);
  }

  detachUpdateHandler(name, callback) {
      this.updateHandlers.detachHandler(name, callback);
  }

  attachRequestHandler(name, callback, callCount) {
      this.requestHandlers.attachHandler(name, callback, callCount);
  }

  detachRequestHandler(name, callback) {
      this.requestHandlers.detachHandler(name, callback);
  }

  attachDefinitionHandler(name, callback, callCount) {
      this.definitionHandlers.attachHandler(name, callback, callCount);
  }

  detachDefinitionHandler(name, callback) {
      this.definitionHandlers.detachHandler(name, callback);
  }

  onReady(callback) {
    this.readyCallbacks.push(callback);
  }

  debug(o) {
    if (this.options.debug) {
      debug(o);
    }
  }

  defaultValues(uavObjectName) {
    let definition = definitionsByName[uavObjectName];
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

Drone.PACKET_TYPES = {
    UPDATE: 'update',
    REQUEST: 'req',
    DEFINITION: 'def',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
}
