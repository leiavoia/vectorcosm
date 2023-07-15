<script setup>
	// import * as Chart from "chart.js";
	import Chart from 'chart.js/auto';
	// you can optimize package size by not including everything. see:
	// https://www.chartjs.org/docs/latest/getting-started/integration.html
	import * as utils from '../util/utils.js'
	import Tank from '../classes/class.Tank.js'
	import Simulation from '../classes/class.Simulation.js'
	import { ref, reactive, markRaw, shallowRef, nextTick, triggerRef, onMounted } from 'vue'
	import { BoidFactory } from '../classes/class.Boids.js'

	// graphing and chart setup				
	Chart.defaults.color = '#FFF';
	Chart.defaults.elements.line.backgroundColor = '#41A34F';
	Chart.defaults.elements.line.borderColor = '#41A34F';
	Chart.defaults.elements.bar.backgroundColor = '#41A34F';
	Chart.defaults.elements.bar.borderColor = '#41A34F';
	Chart.defaults.elements.point.radius = 0;
	
	let props = defineProps(['sim']);
	
	let vars = { round:{} };
	
	function copyPropsFromSim() {
		// settings
		vars.scale = window.vc.scale;
		vars.max_mutation = props.sim.settings.max_mutation;
		vars.num_boids = props.sim.settings.num_boids;
		vars.cullpct = props.sim.settings.cullpct;
		vars.min_score = props.sim.settings.min_score;
		vars.num_foods = props.sim.settings.num_foods;
		vars.time = props.sim.settings.time;
		vars.rounds = props.sim.settings.rounds;
		vars.species = props.sim.settings.species;
		vars.viscosity = props.sim.tank.viscosity;
		vars.best_score = props.sim.stats.best_score;
		vars.best_avg_score = props.sim.stats.best_avg_score;
		vars.framenum = props.sim.stats.framenum;
		vars.round.num = props.sim.stats.round.num;
		vars.round.best_score = props.sim.stats.round.best_score;
		vars.round.avg_score = props.sim.stats.round.avg_score;
		vars.round.time = props.sim.stats.round.time;
	}
	
	function copyStats() {
		vars.best_score = props.sim.stats.best_score;
		vars.best_avg_score = props.sim.stats.best_avg_score;
		vars.framenum = props.sim.stats.framenum;
		vars.round.num = props.sim.stats.round.num;
		vars.round.best_score = props.sim.stats.round.best_score;
		vars.round.avg_score = props.sim.stats.round.avg_score;
		vars.round.time = props.sim.stats.round.time;
		vars.fps = window.vc.fps;
	}
	
	copyPropsFromSim();
	
	vars = reactive(vars);

	function updateViscosity() {
		props.sim.tank.viscosity = vars.viscosity;
	}

	function updateTimeout() {
		props.sim.settings.time = vars.time;
	}

	function updateCulling() {
		props.sim.settings.cullpct = vars.cullpct;
	}

	function updateMutation() {
		props.sim.settings.max_mutation = vars.max_mutation;
	}

	function updateNumBoids() {
		props.sim.SetNumBoids(vars.num_boids);
	}

	function updateScale() {
		window.vc.SetViewScale(vars.scale);
	}
	
	props.sim.onUpdate = _ => {
		copyStats();
	}; 
	
	props.sim.onRound = _ => {
		simulatorChart.data.labels.push(props.sim.stats.round.num);
		simulatorChart.update();
	}; 
	
	// will be created by Chart.js after DOM loads
	let simulatorChart = null;

	onMounted(() => {
		simulatorChart = MakeSimulatorChart('simulatorChart', props.sim.stats.chartdata.averages, props.sim.stats.chartdata.highscores);
	});
	
	function MakeSimulatorChart( element_id, averages, highscores ) {

		const chartdata = {
			labels: [],
			datasets: [
				{
					label: 'Average',
					backgroundColor: '#3DAEE9',
					borderColor: '#3DAEE9',
					borderWidth: 1,
					fill:true,
					data: averages,
					order: 2,
					tension: 0.2,
				},
				{
					label: 'Best',
					backgroundColor: '#55EEFF33',
					borderColor: '#55EEFF33',
					borderWidth: 1,
					fill:true,
					tension: 0.2,
					data: highscores,
				},
			]
		};
		const chartconfig = {
			type: 'line',
			data: chartdata,
			options: {
				responsive: false,
				aspectRatio: 2.5,
				interaction: {
					intersect: false,
				},					
				plugins: {
					legend: {
						position: 'top',
						display:false,
					},
					title: {
						display: false,
					}
				},
				scales: {
					x: { display: false },
					y: { display: false }
				}				
			}
		};
		return new Chart( document.getElementById(element_id), chartconfig );
	}
			
	function ToggleSimulatorFF() {
		window.vc.ToggleSimulatorFF();
	}
	function TogglePause() {
		window.vc.TogglePause();
	}
	
	function ToggleShowSensors() {
		window.vc.ToggleShowSensors();
	}
	
	function ToggleShowBrainmap() {
		window.vc.ToggleShowBrainmap();
	}
	
	function ToggleUI() {
		window.vc.ToggleUI();
	}
	
	function SaveLeader() {
		window.vc.SaveLeader();
	}
	
	function LoadLeader() {
		window.vc.LoadLeader();
	}
				
</script>

<template>
	<div>

		<button @click="TogglePause()" id="pause_button">Pause</button>
		<button @click="ToggleSimulatorFF()" id="fast_forward_button">FF</button>
		<button @click="ToggleUI()" id="hide_ui_button">UI</button>
		<button @click="ToggleShowSensors()" id="show_sensors_button">Sensors</button>
		<button @click="ToggleShowBrainmap()" id="show_brainmap_button">Brain</button>
		<button @click="SaveLeader()" id="save_leader_button">Save</button>
		<button @click="LoadLeader()" id="load_leader_button">Load</button>
		
		<br />
		

		<label for="world_scale_slider">Scale</label>
		<input v-model.number="vars.scale" @change="updateScale()" type="range" min="0.1" max="2" step="0.1" style="margin-bottom:-0.25em;" id="world_scale_slider" />
		<output for="world_scale_slider" id="world_scale_slider_output">{{vars.scale}}</output>

		<br/>


		<label for="numboids_slider">Boids</label>
		<input v-model.number="vars.num_boids" @change="updateNumBoids()" type="range" min="0" max="250" step="1" style="margin-bottom:-0.25em;" id="numboids_slider" />
		<output for="numboids_slider" id="numboids_slider_output">{{vars.num_boids}}</output>

		<br/>

		<label for="viscosity_slider">Viscosity</label>
		<input v-model.number="vars.viscosity" @change="updateViscosity()" type="range" min="0" max="1" step="0.01" style="margin-bottom:-0.25em;" id="viscosity_slider"/>
		<output for="viscosity_slider" id="viscosity_slider_output">{{vars.viscosity}}</output>

		<br/>		

		<label for="mutation_slider">Mutation</label>
		<input v-model.number="vars.max_mutation" @change="updateMutation()" type="range" min="1" max="25" step="1" style="margin-bottom:-0.25em;" id="mutation_slider" />
		<output for="mutation_slider" id="mutation_slider_output">{{vars.max_mutation}}</output>

		<br/>

		<label for="culling_slider">Culling</label>
		<input v-model.number="vars.cullpct" @change="updateCulling()" type="range" min="0.1" max="0.9" step="0.1" style="margin-bottom:-0.25em;" id="culling_slider" />
		<output for="culling_slider" id="culling_slider_output">{{vars.cullpct}}</output>

		<br/>

		<label for="round_time_slider">Timeout</label>
		<input v-model.number="vars.time" @change="updateTimeout()" type="range" min="10" max="180" step="1" style="margin-bottom:-0.25em;" id="round_time_slider" />
		<output for="round_time_slider" id="round_time_slider_output">{{vars.time}}</output>

		<br/>


		Round: <output id="round_output">{{vars.round.num}}</output> | 
		Best: <output id="best_score_output">{{vars.round.best_score.toFixed()}}</output> | 
		Avg: <output id="avg_score_output">{{vars.round.avg_score.toFixed()}}</output>

		<br />

		Sim Best: <output id="total_score_output">{{vars.best_score.toFixed()}}</output> | 
		Best Avg: <output id="best_avg_score_output">{{vars.best_avg_score.toFixed()}}</output>

		<br/>

		T: <output id="sim_time_output">{{vars.round.time.toFixed(1)}}</output> | 
		F: <output id="framenum_output">{{vars.framenum}}</output> |  
		FPS: <output id="fps_output">{{vars.fps}}</output> 

		<br/>
		<canvas id="simulatorChart" style="width: 12em; height: 4em;"></canvas> 
	</div>
	  
			  
</template>

<style>

</style>