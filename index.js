var Drone = function(url, options) {
  this.url = url;

  this.uavObjectDefinitions = {};
  this.options = {
    debug: false
  }

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


  // Second seems to be the Telemetry Stats
  if (uavObject.Name === 'FlightTelemetryStats') {
		this.debug('got FlightTelemetryStats.Status = ' + uavObject.Data.status);

    if (uavObject.Data.Status === 'Disconnected') { // HINT: Create an UavObject class ?
      
    }
  }
}


Drone.prototype.sendMessage = function(name, requestType, data) {
  var encodedRequestType  = this.REQUEST_TYPES[requestType];
  var uavObjectDefinition = this.uavObjectDefinitionsByName[name];

  if (_.isUndefined(uavObjectDefinition)) {
    throw "Unkown UAVObject Exception";
  }

  this.socket.send(JSON.stringify({
    ObjectId: uavObjectDefinition.id,
    Cmd: encodedRequestType, 
    Data: data 
  }));
}

Drone.prototype.setupTelemetry = function() { 
  this.debug("Handshaking Telemetry stats");

  this.sendMessage('GCSTelemetryStats', 'object', {
			Status: 'HandshakeReq',
			TxDataRate: 0,
			RxDataRate: 0,
			TxFailures: 0,
			RxFailures: 0,
			TxRetries: 0
  });

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
