var UavBox = React.createClass({
  getInitialState: function() {
    return {uav: {}};
  },

  componentDidMount: function() {
    this.drone = this.props.drone;
    
    if (!this.drone.isConnected()) {
      this.drone.connect(); 
    }

  this.drone.ready = function() {
    this.drone.attachHandler(this.props.uav, function(uavObject) {
      this.setState({uav: uavObject.Data});
    }.bind(this))
  }.bind(this);
      
  },
  render: function() {
    return (
      <div className="uav-box">
        <ValueBox name="Pitch"  value={this.state.uav["Pitch"]} />
        <ValueBox name="Roll"   value={this.state.uav["Roll"]} />
        <ValueBox name="Yaw"    value={this.state.uav["Yaw"]} />
        <ValueBox name="q1"     value={this.state.uav["q1"]} />
        <ValueBox name="q2"     value={this.state.uav["q2"]} />
        <ValueBox name="q3"     value={this.state.uav["q3"]} />
        <ValueBox name="q4"     value={this.state.uav["q4"]} />
      </div>
    )
  }
});

var ValueBox = React.createClass({
  getDefaultProps: function() {
    return {value:0};
  },

  render: function() { 
    return (
      <div className="ValueBox"> 
        {this.props.name} = {this.props.value} 
      </div>
    )
  }
});


React.render(
  <UavBox drone={drone} uav="AttitudeActual" />, 
  $('#app')[0]
);
