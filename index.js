var Drone = function(url, options) {
  this.url = url;

  this.uavObjectDefinitions = {};
  this.options = {
    debug: false
  }

  // Handlers that will be attached to UavObjects
  this.handlers = {};

  _.extend(this.options, options);
}

Drone.prototype.connect = function() {
  this.socket = new WebSocket(this.url);
  this.socket.onmessage = _.bind(this.messageHandler, this);

  return;
}

Drone.prototype.messageHandler = function(event) {
  var uavObject = JSON.parse(event.data);

  // First message is always an array of objects definitions
  if (_.isEmpty(this.uavObjectDefinitionsByName)) {
    this.uavObjectDefinitionsById = _.indexBy(uavObject, 'id');
    this.uavObjectDefinitionsByName = _.indexBy(uavObject, 'name');

    this.setupTelemetry();

    return;
  }

  if (this.handlers[uavObject.Name]) { 
    this.handlers[uavObject.Name](uavObject);
  }

  return;
  // Second seems to be the Telemetry Stats
  if (uavObject.Name === 'FlightTelemetryStats') {
		this.debug('got FlightTelemetryStats.Status = ' + uavObject.Data.Status);

    if (uavObject.Data.Status === 'Disconnected') { // HINT: Create an UavObject class ?
      
    }
  }
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
  this.handlers['FlightTelemetryStats'] = function(uavObjectResponse) {
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
        break;
      default:
        debug('Received unknown data\n' + uavObjectResponse.Data.Status)
        throw("Unknown UavObjectResponse Status");
    }
  };

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

$(function() {
  var drone = new Drone("ws://192.168.254.135:3000/uav", {debug:true});
  drone.connect();

  window.drone = drone; // debug purpose
  
  setTimeout(function() { 
    var elements = _.map(_.keys(drone.uavObjectDefinitionsByName), function(e) {
      var s = "<li>";
      s += e
      s += "</li>";

      return s;
    });

    $('#uav-definitions').html("<ul>" + elements + "</ul>");
  }, 3000);
});
