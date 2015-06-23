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
  var data = JSON.parse(event.data);

  // First message is always an array of objects definitions
  if (_.isEmpty(this.uavObjectDefinitions)) {
    this.uavObjectDefinitionsById = _.indexBy(data, 'id');
    this.uavObjectDefinitionsByName = _.indexBy(data, 'name');

    this.debug(this.uavObjectDefinitionsByName);
  }
}

Drone.prototype.sendMessage = function(name, requestType, data) {
  var encodedRequestType  = this.REQUEST_TYPES[requestType];
  var uavObjectDefinition = this.uavObjectDefinitionsByName[name];

  if (_.isUndefined(uavObjectDefinition)) {
    throw "Unkown UAVObject Exception";
  }

  this.socket.send(JSON.stringify({
    id: uavObjectDefinition.id,
    cmd: encodedRequestType, 
    data: data  
  }));
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
