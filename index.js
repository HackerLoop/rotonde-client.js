var Drone = function(url) {
  this.url = url;
}

Drone.prototype.connect = function() {
  this.socket = new WebSocket(this.url);
  this.socket.onmessage = this.messageHandler.bind(this);

  return;
}

Drone.prototype.messageHandler = function(event) {
  var data = JSON.parse(event.data);
  console.log(data);
}

var drone = new Drone("ws://192.168.254.135:3000/uav");
drone.connect();
