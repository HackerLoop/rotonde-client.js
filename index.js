import {newClient} from "./src/Drone.js"

// Is that the proper way to do it given index.js is made to be used only by the browser?
window.Drone = {
    newClient
};
