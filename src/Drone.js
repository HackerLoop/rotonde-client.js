"use strict";

import _ from "lodash";

// Client
export const newClient = function(url, options) {

    let options = {
        debug: false
    }
    _.extend(options, options);

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
                    console.log("Unknown Definition Exception -> " + objectId);
                }
                return definition;
            },

            getDefinitionByName(name) {
                let definition = definitionByName[name];

                if (_.isUndefined(definition)) {
                    console.log("Unknown Definition Exception -> " + name);
                }
                return definition;
            },

            addDefinition(definition) {
                definitions.push(definition);

                // update indexes
                definitionById = _.indexBy(definitions, 'id');
                definitionByName = _.indexBy(definitions, 'name');
            },

            defaultObject(name) {
                let definition = definitionsStore.getDefinitionByName(name);
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
            let handlers =  this.handlers[name];
            handlers.splice(index--, 1);
            if (handlers.length == 0) {
                this.handlers[name] = null;
                lastRemovedCallback(name);
            }
        };

        return {
            callHandlers(name, param) {
                // Dispatch events to their callbacks
                if (handlers[name]) {
                    let handlers = handlers[name];

                    for (let i = 0; i < handlers.length; i++) {
                        let callback  = handlers[i][0];
                        let callCount = handlers[i][1];

                        if (callCount > 0) {  // it's not a permanent callback
                            if (--handlers[i][1] == 0) { // did it consumed all its allowed calls ?
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
                    firstAddedCallback(name);
                }

                this.handlers[name].push([callback, callCount]);
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
            }
        }
    };

    // Abstracts a websocket to send as inner JSON protocol
    let newDroneConnection = function(url, ready, onmessage) {
        let connected = false;
        let socket = new WebSocket(this.url);
        socket.onmessage = onmessage;

        const PACKET_TYPES = {
            UPDATE: 'update',
            REQUEST: 'req',
            DEFINITION: 'def',
            SUBSCRIBE: 'sub',
            UNSUBSCRIBE: 'unsub'
        }

        this.socket.onopen = function(event) {
            connected = true;
            ready();
        };

        return {
            isConnected() {
                return connected;
            },

            sendUpdate(name, data) {
                let definition = definitionsStore.getDefinitionByName(name);
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

            sendRequest(name, instanceId) {
                let definition = definitionsStore.getDefinitionByName(name);
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

            sendSubsribe(name) {
                let definition = definitionsStore.getDefinitionByName(name);
                if (!definition)return;

                this.socket.send(JSON.stringify({
                    type: Drone.REQUEST_TYPES.SUBSCRIBE,
                    payload: {
                        objectId: definition.id
                    }
                }));
            },

            sendUnsubsribe(name) {
                let definition = definitionsStore.getDefinitionByName(name);
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

    let readyCallbacks = [];

    let client = {};
    client.updateHandlers = newHandlerManager(function(name) {
        client.connection.sendSubscribe(name);
    }, function(name) {
        client.connection.sendUnsubsribe(name);
    });
    client.requestHandlers = newHandlerManager();
    client.definitionHandlers = newHandlerManager();

    _.extend(client, {
        definitionsStore,

        connect() {
            this.connection = newDroneConnection(this.url, function() {
                _.forEach(this.readyCallbacks, function(readyCallback) {
                    readyCallback();
                });

                // send subsribe for all already registered updateHandlers
                _.forEach(this.updateHandlers, function(name) {
                    this.connection.sendSubscribe(name);
                }.bind(this))
            }, _.bind(this.handleMessage, this)); // benefits of _.bind over .bind() ? backward compat ?
        },

        handleMessage(event) {
            let packet = JSON.parse(event.data);

            if (packet.type == Drone.REQUEST_TYPES.UPDATE) {
                let update = packet.payload;
                let objectId = update.objectId;
                let definition = definitionsById[objectId];
                if (definition) {
                    this.updateHandlers.callHandlers(definition.name, update);
                }
            } else if (packet.type == Drone.REQUEST_TYPES.REQUEST) {
                let request = packet.payload;
                let objectId = request.objectId;
                let definition = definitionsById[objectId];
                if (definition) {
                    this.requestHandlers.callHandlers(definition.name, request);
                }
            } else if (packet.type == Drone.REQUEST_TYPES.DEFINITION) {
                let definition = packet.payload;
                definitionsStore.addDefinition(definition);

                this.definitionHandlers.callHandlers(definition.name, definition);
            }
        },

        onReady(callback) {
            if (this.connection.isConnected()) {
                callback();
                return;
            }
            this.readyCallbacks.push(callback);
        }
    });

    return client;
};
