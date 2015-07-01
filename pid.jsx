var StatsBox = React.createClass({
  getInitialState: function() {
    return {uavs: this.props.uavs}
  },

  componentDidMount: function() {
    this.drone = this.props.drone;
    
    if (!this.drone.isConnected()) {
      console.log("connecting")
      this.drone.connect(); 
    }

  }, 

  render: function() {
    return (
      <div className="stats-box">
        {this.state.uavs.map(function(uav, index) {
          return (
            <UavBox key={index} drone={this.props.drone} uav={this.state.uavs[index]} />
          )
        }.bind(this))};
      </div>
    )
  }
});

var UavBox = React.createClass({
  getInitialState: function() {
    return {uav: {}};
  },

  componentDidMount: function() {
    console.log("Mounted: " + this.props.uav)
      if (this.props.uav == "StabilizationSettings") {
        this.props.drone.onReady(function() {
          this.props.drone.sendMessage("StabilizationSettings", "objectRequest", {})
        }.bind(this));
      }

    this.props.drone.onReady(function() { 
      this.props.drone.attachHandler(this.props.uav, function(uavObject) {
        this.setState({uav: uavObject.data});
      }.bind(this))
    }.bind(this));
      
  },
  render: function() {
    return (
      <div className="uav-box">
        {Object.keys(this.state.uav).map(function(key, index) {
          return (
            <ValueBox key={index} name={key} value={this.state.uav[key]} />
          )
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


var uavs = ["AttitudeActual", "SystemStats", "StabilizationSettings"];
React.render(
  <StatsBox drone={drone} uavs={uavs} />,
  $('#app')[0]
);
