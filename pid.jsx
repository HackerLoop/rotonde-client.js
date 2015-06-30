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
        {Object.keys(this.state.uav).map(function(key) {
          return (
            <ValueBox name={key}  value={this.state.uav[key]} />
          );
        }.bind(this))}
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
