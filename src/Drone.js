"use strict";

import _ from "lodash";

var debug = function(o) {
    if (this.options.debug) {
        console.log(o);
    }
};

// stores and indexes definitions
var newDefinitionsStore = function() {
    var definitions = [];

    // definitions indexing
    var definitionsById = {};
    var definitionsByName = {};

    return {
        getDefinitionById: function(objectId) {
            var definition = definitionsById[objectId];

            if (_.isUndefined(definition)) {
                console.log("Unknown Definition Exception -> " + objectId);
            }
            return definition;
        },
        getDefinitionByName: function(name) {
            var definition = definitionByName[name];

            if (_.isUndefined(definition)) {
                console.log("Unknown Definition Exception -> " + name);
            }
            return definition;
        },
        addDefinition = function(definition) {
            definitions.push(definition);

            // update indexes
            definitionById = _.indexBy(definitions, 'id');
            definitionByName = _.indexBy(definitions, 'name');
        }
    }
};

// stores handlers by name, can auto remove handlers after n calls.
// callbacks can be passed to this function, they will be called when a given name gets its first handler, or when a given name removed its last handler
var newHandlerManager = function(firstAddedCallback, lastRemovedCallback) {

    var handlers = {};

    var detachHandlerAtIndex = function(name, index) {
        var handlers =  this.handlers[name];
        handlers.splice(index--, 1);
        if (handlers.length == 0) {
            this.handlers[name] = null;
            lastRemovedCallback(name);
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

        registeredNames: function() {
            return _.keys(handlers);
        },

        // TODO use promises, ASAP
        attachHandler: function(name, callback, callCount) {
            if (callCount == undefined)
            callCount = -1;

            if (handlers[name] === undefined) {
                handlers[name] = [];
                firstAddedCallback(name);
            }

            this.handlers[name].push([callback, callCount]);
        },

        detachHandler: function(name, callback) {
            var handlers =  this.handlers[name];
            for (var i = 0; i < handlers.length; i++) {
                var cb  = handlers[i][0];
                if (cb == callback) {
                    detachHandlerAtIndex(name, i);
                }
            }
        },

        attachOnce: function(name, callback) {
            this.attachHandler(name, callback, 1);
        }
    }
};

var newDroneConnection = function(url, ready, onmessage) {
    var connected = false;
    var socket = new WebSocket(this.url);
    socket.onmessage = onmessage;

    this.socket.onopen = function(event) {
        connected = true;
        ready();
    };

    return {
        isConnected: function() {
            return connected;
        },

        sendUpdate: function(name, data) {
            var definition = definitionsStore.getDefinitionByName(name);
            if (!definition)return;

            this.socket.send(JSON.stringify({
                type: Drone.REQUEST_TYPES.UPDATE,
                payload: {
                    objectId: definition.id,
                    instanceId: 0,
                    data: data
                }
            }));
        },

        sendRequest: function(name, instanceId) {
            var definition = definitionsStore.getDefinitionByName(name);
            if (!definition)return;

            this.socket.send(JSON.stringify({
                type: Drone.REQUEST_TYPES.REQUEST,
                payload: {
                    objectId: definition.id,
                    instanceId: instanceId
                }
            }));
        },

        // sendDefinition

        sendSubsribe: function(name) {
            var definition = definitionsStore.getDefinitionByName(name);
            if (!definition)return;

            this.socket.send(JSON.stringify({
                type: Drone.REQUEST_TYPES.SUBSCRIBE,
                payload: {
                    objectId: definition.id
                }
            }));
        },

        sendUnsubsribe: function(name) {
            var definition = definitionsStore.getDefinitionByName(name);
            if (!definition)return;

            this.socket.send(JSON.stringify({
                type: Drone.REQUEST_TYPES.UNSUBSCRIBE,
                payload: {
                    objectId: definition.id
                }
            }));
        }
    }
}

export class Drone {
    constructor(url, options) {
        this.url = url;

        this.readyCallbacks = [];

        this.options = {
            debug: false
        }
        _.extend(this.options, options);

        this.updateHandlers = newHandlerManager(function(name) {
            this.connection.sendSubscribe(name);
        }, function(name) {
            this.connection.sendUnsubsribe(name);
        });
        this.requestHandlers = newHandlerManager();
        this.definitionHandlers = newHandlerManager();
    }

    connect() {
        this.connection = newDroneConnection(this.url, function() {
            _.forEach(this.readyCallbacks, function(readyCallback) {
                readyCallback();
            });

            // send subsribe for all already registered updateHandlers
            _.forEach(this.updateHandlers, function(name) {
                this.connection.sendSubscribe(name);
            })
        }, _.bind(this.handleMessage, this));
    }

    isConnected() {
        return this.connection.isConnected();
    }

    readUav(name, callback) {
        this.connection.sendRequest(name);
        this.updateHandlers.attachOnce(name, callback);
    }

    handleMessage(event) {
        var packet = JSON.parse(event.data);

        if (packet.type == Drone.REQUEST_TYPES.UPDATE) {
            var update = packet.payload;
            var objectId = update.objectId;
            var definition = definitionsById[objectId];
            if (definition) {
                this.updateHandlers.callHandlers(definition.name);
            }
        } else if (packet.type == Drone.REQUEST_TYPES.REQUEST) {
            var request = packet.payload;
            var objectId = request.objectId;
            var definition = definitionsById[objectId];
            if (definition) {
                this.requestHandlers.callHandlers(definition.name);
            }
        } else if (packet.type == Drone.REQUEST_TYPES.DEFINITION) {
            var definition = packet.payload;
            definitionsStore.addDefinition(definition);

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
        var definition = definitionsStore.getDefinitionByName(name);
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

Drone.PACKET_TYPES = {
    UPDATE: 'update',
    REQUEST: 'req',
    DEFINITION: 'def',
    SUBSCRIBE: 'sub',
    UNSUBSCRIBE: 'unsub'
}
