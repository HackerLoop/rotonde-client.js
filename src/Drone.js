"use strict";

import _ from "lodash";

export class Drone {
  constructor(url, options) {
    this.url = url;
    this.telemetryReady = false;
    this.readyCallbacks = [];

    this.options = {
      debug: false
    }

    // Handlers that will be attached to UavObjects
    this.handlers = {};

    _.extend(this.options, options);
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = _.bind(this.handleMessage, this);

    this.onDefinitionsLoaded = _.bind(function() {
      this.setupTelemetry();
    }, this);

    this.connected = true
      return;
  }

  isConnected() {
    return this.connected;
  }

  readUav(name, callback) { 
    this.sendMessage(name, 'objectRequest', {});
    this.attachOnce(name, callback);
  }

  handleMessage(event) {
    var uavObject = JSON.parse(event.data);

    // First message is always an array of objects definitions
    if (_.isEmpty(this.uavObjectDefinitionsByName)) {
      this.uavObjectDefinitionsById = _.indexBy(uavObject, 'objectId');
      this.uavObjectDefinitionsByName = _.indexBy(uavObject, 'name');

      this.debug("Definitions loaded");
      this.onDefinitionsLoaded();

      return;
    }

    // Dispatch events to their callbacks
    if (this.handlers[uavObject.name]) {
      var handlers = this.handlers[uavObject.name]; 

      for (var i = 0; i < handlers.length; i++) {
        var callback  = handlers[i][0];
        var callCount = handlers[i][1];

        if (callCount > 0) {  // it's not a permanent callback
          if (--handlers[i][1] == 0) { // did it consumed all its allowed calls ?
            this.debug("Detaching consumed callback from " + uavObject.name);
            handlers.splice(i--, 1);
          }
        }

        callback(uavObject);
      }
    }

    return;
  }

  sendMessage(name, requestType, data) {
    var encodedRequestType  = Drone.REQUEST_TYPES[requestType];
    var uavObjectDefinition = this.uavObjectDefinitionsByName[name];

    if (_.isUndefined(uavObjectDefinition)) {
      throw "Unknown UAVObject Exception";
    }

    this.socket.send(JSON.stringify({
      objectId: uavObjectDefinition.id,
      cmd: encodedRequestType,
      data: data
    }));
  }

  setupTelemetry() {
    this.debug("Handshaking Telemetry stats");

    var that = this;
    var handshake = function(status) {
      that.sendMessage('GCSTelemetryStats', 'object', {
        Status: status,
        TxDataRate: 0,
        RxDataRate: 0,
        TxFailures: 0,
        RxFailures: 0,
        TxRetries: 0
      });
    };

    handshake('HandshakeReq');

    var debug = _.bind(this.debug, this);
    // TODO is this really an uavobject ? or is this just a response ?

    this.attachHandler('FlightTelemetryStats', function(uavObjectResponse) {
      switch (uavObjectResponse.data.Status) {
        case 'HandshakeAck':
          debug('Received HandshakeAck, sending Connected');
          handshake('Connected');
          break;
        case 'Disconnected':
          debug('Received Disconnected, sending HandshakeReq');
          handshake('HandshakeReq'); // start over
          break;
        case 'Connected':
          debug('Received Connected, sending HandshakeConnected');
          handshake('Connected');    // just in case (TODO is that really necessary?)

          if (!that.telemetryReady) {
            that.telemetryReady = true;

            that.readyCallbacks.forEach(function(callback) {
              callback();
            });
          }
          break;
        default:
          debug('Received unknown data\n' + uavObjectResponse.data.Status)
            throw("Unknown UavObjectResponse Status");
      }
    }, -1);

    // this handshake is a bit more specific than the others
    // as it involves FlightTelemetryStats and GCSTelemetryStats.

    // send GCSTelemetryStats HandshakeReq
    // recv FlightTelemetryStats
    // if disconnected
    //  send GCSTelemetryStats HandshakeReq # restart
    // elsif HandshakeAck || Connected
    //github.com/openflylab/drone.js/commit/9b0086
    //  send GCSTelemetryStats Connected
    //
    // heartbeat(period: 5) {
    //  send FlightStatus       // TODO wtf
    //  send ActuatorCommand    // TODO wtf
    // }
  }

  // TODO use promises, ASAP
  attachHandler(name, callback, callCount) {
    if (callCount == undefined)
      callCount = -1;

    if (_.contains(_.keys(this.uavObjectDefinitionsByName), name)) {
      if (this.handlers[name] === undefined) {
        this.handlers[name] = [];
      }

      this.handlers[name].push([callback, callCount]);
    } else {
      throw("Unknown Uav handler");
    }
  }

  attachOnce(name, callback) {
    this.attachHandler(name, callback, 1);
  }

  onReady(callback) {
    this.readyCallbacks.push(callback);
  }

  debug(o) {
    if (this.options.debug) {
      console.log(o);
    }
  }

  defaultValues(uavObjectName) {
    let definition = this.uavObjectDefinitionsByName[uavObjectName];
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

Drone.REQUEST_TYPES = {
  'object': 0,
  'objectRequest': 1,
  'objectAck': 2,
  'ack': 3,
  'nack': 4
}
