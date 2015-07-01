"use strict";

(function() {
  var root = this;
  var previousDrone = root.Drone;

  var has_require = typeof require !== 'undefined'
  var _ = root._
  if( typeof _ === 'undefined' ) {
    if( has_require ) {
      _ = require('underscore');
    }
    else throw new Error('Drone requires underscore, see http://underscorejs.org');
  }

  var Drone = function(url, options) {
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

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Drone;
    }
    exports.Drone = Drone
  } else {
    root.Drone = Drone;
  }

  Drone.prototype.connect = function() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = _.bind(this.messageHandler, this);

    this.onDefinitionsLoaded = _.bind(function() {
      this.setupTelemetry();
    }, this);

    this.connected = true
    return;
  }

  Drone.prototype.isConnected = function() {
    return this.connected;
  }

  Drone.prototype.readUav = function(name, callback) { 
    this.sendMessage(name, 'objectRequest', {});
    this.attachOnce(name, callback);
  }
  
  Drone.prototype.messageHandler = function(event) {
    var uavObject = JSON.parse(event.data);

    // First message is always an array of objects definitions
    if (_.isEmpty(this.uavObjectDefinitionsByName)) {
      this.uavObjectDefinitionsById = _.indexBy(uavObject, 'id');
      this.uavObjectDefinitionsByName = _.indexBy(uavObject, 'name');

      this.debug("Definitions loaded");
      this.onDefinitionsLoaded();

      return;
    }

    // Dispatch events to their callbacks
    if (this.handlers[uavObject.Name]) {
      var handlers = this.handlers[uavObject.Name]; 

      for (var i = 0; i < handlers.length; i++) {
        var callback  = handlers[i][0];
        var callCount = handlers[i][1];

        if (callCount > 0) {  // it's not a permanent callback
          if (--handlers[i][1] == 0) { // did it consumed all its allowed calls ?
            this.debug("Detaching consumed callback from" + uavObject.Name);
            handlers.splice(i--, 1);
          }
        }

        callback(uavObject);
      }
    }

    return;
  }

  Drone.prototype.sendMessage = function(name, requestType, data) {
    var encodedRequestType  = this.REQUEST_TYPES[requestType];
    var uavObjectDefinition = this.uavObjectDefinitionsByName[name];

    if (_.isUndefined(uavObjectDefinition)) {
      throw "Unknown UAVObject Exception";
    }

    this.socket.send(JSON.stringify({
      ObjectId: uavObjectDefinition.id,
      Cmd: encodedRequestType,
      Data: data
    }));
  }

  Drone.prototype.setupTelemetry = function() {
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
      switch (uavObjectResponse.Data.Status) {
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
          debug('Received unknown data\n' + uavObjectResponse.Data.Status)
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
  Drone.prototype.attachHandler = function(name, callback, callCount) {
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

  Drone.prototype.attachOnce = function(name, callback) {
    this.attachHandler(name, callback, 1);
  }

  Drone.prototype.onReady = function(callback) {
    this.readyCallbacks.push(callback);
  }

  Drone.prototype.debug = function(o) {
    if (this.options.debug) {
      console.log(o);
    }
  }

  Drone.prototype.REQUEST_TYPES = {
    'object': 0,
    'objectRequest': 1,
    'objectAck': 2,
    'ack': 3,
    'nack': 4
  }

  Drone.noConflict = function() {
    root.Drone = previousDrone;
    return Drone;
  }
}).call(this);
