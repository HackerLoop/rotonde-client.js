# Drone.js 

**The drone library**

## Introduction

Drone.js is a library that allows to control a drone with Javascript.
It abstracts handling UAV objects that the drone understands by
providing a simple api. 


```javascript
  var Drone = require('drone').Drone;
```

## Documentation 

Using it from node:

```
npm install 
```

Using it from the browser: 

```
npm install
bower install 
gulp watch
```

Remember to launch the bridge aside with 

```
./bridge -port 5000 path-to-definItions/
```

And open your browser on `http://127.0.0.1:3000` or `http://127.0.0.1:3000/pid.html`.

## Contributing 

