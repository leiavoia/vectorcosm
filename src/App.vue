<script setup>
import Two from "two.js";
import neataptic from "neataptic";
// import * as Chart from "chart.js";
import Chart from 'chart.js/auto';
// you can optimize package size by not including everything. see:
// https://www.chartjs.org/docs/latest/getting-started/integration.html
import * as utils from './util/utils.js'
import Tank from './classes/class.Tank.js'
import Vectorcosm from './classes/class.Vectorcosm.js'
import Simulation from './classes/class.Simulation.js'
import BrainGraph from './classes/class.BrainGraph.js'
import SimulatorControls from './components/SimulatorControls.vue'
// import Plant from './classes/class.Plant.js'
// import Poison from './classes/class.Poison.js'
import { onMounted, ref, reactive, markRaw, shallowRef, shallowReactive } from 'vue'

let sim = shallowRef(null);

let vc = new Vectorcosm; // the app, proper
window.vc = vc; 
window.vc.onSimulationChange = new_sim => { sim.value = new_sim; }


// Handle key down events
const body = document.querySelector("body");
body.addEventListener("touchstart", function(event) {
	event.preventDefault();
	if ( !vc.show_ui ) { vc.ToggleUI(); }
});
body.addEventListener("keydown", function(event) {
	if ( event.keyCode == 19 ) {  // `Pause` 
		vc.TogglePause();
	}
	else if ( event.keyCode == 37 ) {  // `left arrow` 
		event.preventDefault();
		vc.ShiftFocusTarget(-1);
	}
	else if ( event.keyCode == 39 ) {  // `right arrow` 
		event.preventDefault();
		vc.ShiftFocusTarget();
	}
	else if ( event.which == 49 ) {  // `1` 
		event.preventDefault();
		vc.ToggleShowSensors();
	}
	else if ( event.which == 50 ) {  // `2` 
		event.preventDefault();
		vc.ToggleUI()
	}
	else if ( event.which == 66 ) {  // `B` 
		event.preventDefault();
		vc.ToggleShowBrainmap()
	}
	else if ( event.which == 51 ) {  // `3` 
		event.preventDefault();
		vc.SaveLeader();
	}
	else if ( event.which == 52 ) {  // `4` 
		event.preventDefault();
		vc.LoadLeader();
	}
	else if ( event.which == 57 ) {  // `9` 
		event.preventDefault();
		vc.SavePopulation();
	}
	else if ( event.which == 48 ) {  // `0` 
		event.preventDefault();
		vc.LoadPopulation();
	}
	else if ( event.which == 35 ) {  // `END` 
		event.preventDefault();
		vc.ToggleSimulatorFF();
	}
	else if ( event.which == 76 ) {  // `L` 
		event.preventDefault();
		const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		if ( b ) console.log(b);
	}
});
			
window.addEventListener("resize", function (event) {
	vc.height = window.innerHeight;
	vc.width = window.innerWidth;
	vc.two.fit();
	vc.SetViewScale( vc.scale ); // trigger update, even though scale hasent changed
});
				

onMounted(() => {
	vc.Init();
	vc.Play();
}) 



</script>

<template>
    <div class="shape-container">
      <div id="draw-shapes"></div>
    </div>
    <div class="ui" id="ui_container" v-if="sim">
		<simulator-controls :sim="sim"></simulator-controls>
    </div>
</template>

<style scoped>

</style>
