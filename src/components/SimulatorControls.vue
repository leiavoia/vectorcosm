<script setup>
	// import * as Chart from "chart.js";
	import Chart from 'chart.js/auto';
	// you can optimize package size by not including everything. see:
	// https://www.chartjs.org/docs/latest/getting-started/integration.html
	import * as utils from '../util/utils.js'
	import TankMaker from '../classes/class.TankMaker.js'
	import Tank from '../classes/class.Tank.js'
	import { ref, reactive, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'

	// graphing and chart setup				
	Chart.defaults.color = '#FFF';
	Chart.defaults.elements.line.backgroundColor = '#41A34F';
	Chart.defaults.elements.line.borderColor = '#41A34F';
	Chart.defaults.elements.bar.backgroundColor = '#41A34F';
	Chart.defaults.elements.bar.borderColor = '#41A34F';
	Chart.defaults.elements.point.radius = 0;
	
	let props = defineProps(['sim']);
	
	let vars = { round:{} };
	
	// will be created by Chart.js after DOM loads
	let simulatorChart = null;
		
	function copyPropsFromSim() {
		// settings
		vars.scale = window.vc.scale;
		vars.current = props.sim.settings?.current || 0;
		vars.max_mutation = props.sim.settings.max_mutation;
		vars.num_boids = props.sim.settings.num_boids;
		vars.cullpct = props.sim.settings.cullpct;
		vars.min_score = props.sim.settings.min_score;
		vars.num_foods = props.sim.settings.num_foods;
		vars.time = props.sim.settings.time;
		vars.species = props.sim.settings.species;
		vars.viscosity = props.sim.tank.viscosity;
		vars.fruiting_speed = props.sim.tank.fruiting_speed || 1.0;
		vars.num_rocks = props.sim.settings.num_rocks || 0;
		vars.num_plants = props.sim.settings.num_plants || 0;
		vars.best_score = props.sim.stats.best_score;
		vars.best_avg_score = props.sim.stats.best_avg_score;
		vars.framenum = props.sim.stats.framenum;
		vars.round.num = props.sim.stats.round.num;
		vars.round.best_score = props.sim.stats.round.best_score;
		vars.round.avg_score = props.sim.stats.round.avg_score;
		vars.round.time = props.sim.stats.round.time;
		vars.name = props.sim.settings.name;
		vars.rounds = props.sim.settings.end?.rounds;
		vars.segments = window.vc.sim_meta_params.segments;
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
		vars.name = props.sim.settings.name;
		vars.xmin = window.vc.camera.xmin;
		vars.ymin = window.vc.camera.ymin;
		vars.xmax = window.vc.camera.xmax;
		vars.ymax = window.vc.camera.ymax;
		vars.camx = window.vc.camera.x;
		vars.camy = window.vc.camera.y;
		vars.camz = window.vc.camera.z;
		vars.cinema_mode = window.vc.camera.cinema_mode;
	}
	
	vars = reactive(vars);

	function updateViscosity() {
		props.sim.tank.viscosity = vars.viscosity;
	}

	function updateCurrent() {
		props.sim.settings.current = vars.current || 0;
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

	function updateFruitingSpeed() {
		props.sim.settings.fruiting_speed = vars.fruiting_speed;
	}

	function updateNumBoids() {
		props.sim.SetNumBoids(vars.num_boids);
	}

	function updateNumRocks() {
		props.sim.SetNumRocks(vars.num_rocks);
	}

	function updateNumPlants() {
		props.sim.SetNumPlants(vars.num_plants);
	}

	function endSim() {
		props.sim.killme = true;
	}

	function updateScale() {
		window.vc.SetViewScale(vars.scale);
		window.vc.ResizeTankToWindow(true); // force
		window.vc.ResetCameraZoom();
	}
	
	const loadCallbacksOnSim = () => {
		props.sim.onUpdate = _ => {
			copyStats();
		}; 
		props.sim.onRound = _ => {
			simulatorChart.data.labels.push(props.sim.stats.round.num);
			simulatorChart.update();
		};
		copyPropsFromSim();
		if ( simulatorChart ) { 
			simulatorChart.destroy();
			simulatorChart = MakeSimulatorChart('simulatorChart', props.sim.stats.chartdata.averages, props.sim.stats.chartdata.highscores);
		}
	};
	
	// watch for updates
	watch( props, loadCallbacksOnSim ); 
	
	// get started
	loadCallbacksOnSim();

		 
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
	
	function SavePopulation() {
		window.vc.SavePopulation();
	}
	
	function LoadPopulation() {
		window.vc.LoadPopulation();
	}
	
	function RandomTank() {
		// this is really overreaching and we should make something cleaner
		const w = window.vc.tank.width;
		const h = window.vc.tank.height;
		const boids = window.vc.tank.boids.splice(0,window.vc.tank.boids.length);
		window.vc.tank.Kill();
		window.vc.tank = new Tank( w, h );
		window.vc.tank.boids = boids;
		window.vc.tank.boids.forEach( b => b.tank = window.vc.tank );
		props.sim.tank = window.vc.tank;
		window.vc.tank.MakeBackground();
		const tm = new TankMaker( window.vc.tank, {} );
		tm.Make();
		window.vc.SetRenderStyle( window.vc.render_style );
		window.vc.ResetCameraZoom();
	}
				
</script>

<template>
	<div>

		<button @click="TogglePause()" id="pause_button">Pause</button>
		<button @click="ToggleSimulatorFF()" id="fast_forward_button">FF</button>
		<button @click="endSim()">End</button>
		<button @click="$emit('close')" id="hide_ui_button">UI</button>
		<!-- <button @click="ToggleShowSensors()" id="show_sensors_button">Sensors</button> -->
		<button @click="ToggleShowBrainmap()" id="show_brainmap_button">Brain</button>
		<button @click="SavePopulation()" id="save_leader_button">Save</button>
		<button @click="LoadPopulation()" id="load_leader_button">Load</button>
		<button @click="RandomTank()" id="random_tank_button">🎲</button>
		
		<br />
		<br/>

		<label for="world_scale_slider">Scale</label>
		<input v-model.number="vars.scale" @change="updateScale()" type="range" min="0.04" max="2" step="0.02" style="margin-bottom:-0.25em;" id="world_scale_slider" />
		<output for="world_scale_slider" id="world_scale_slider_output">{{(vars.scale||1).toFixed(2)}}x</output>

		<br/>


		<label for="numboids_slider">Boids</label>
		<input v-model.number="vars.num_boids" @change="updateNumBoids()" type="range" min="0" max="250" step="1" style="margin-bottom:-0.25em;" id="numboids_slider" />
		<output for="numboids_slider" id="numboids_slider_output">{{vars.num_boids}}</output>

		<br/>

		<label for="viscosity_slider">Viscosity</label>
		<input v-model.number="vars.viscosity" @change="updateViscosity()" type="range" min="0" max="1" step="0.01" style="margin-bottom:-0.25em;" id="viscosity_slider"/>
		<output for="viscosity_slider" id="viscosity_slider_output">{{(vars.viscosity*100).toFixed(0)}}%</output>

		<br/>		

		<label for="current_slider">Current</label>
		<input v-model.number="vars.current" @change="updateCurrent()" type="range" min="0" max="1" step="0.01" style="margin-bottom:-0.25em;" id="current_slider"/>
		<output for="current_slider" id="current_slider_output">{{(vars.current*100).toFixed(0)}}%</output>

		<br/>		

		<label for="mutation_slider">Mutation</label>
		<input v-model.number="vars.max_mutation" @change="updateMutation()" type="range" min="0" max="1" step="0.01" style="margin-bottom:-0.25em;" id="mutation_slider" />
		<output for="mutation_slider" id="mutation_slider_output">{{(vars.max_mutation*100).toFixed(0)}}%</output>

		<br/>

		<div v-if="vars.time">
			<label for="culling_slider">Culling</label>
			<input v-model.number="vars.cullpct" @change="updateCulling()" type="range" min="0.1" max="0.9" step="0.1" style="margin-bottom:-0.25em;" id="culling_slider" />
			<output for="culling_slider" id="culling_slider_output">{{(vars.cullpct*100).toFixed(0)}}%</output>
		</div>

		<label for="fruiting_speed_slider">Fruiting</label>
		<input v-model.number="vars.fruiting_speed" @change="updateFruitingSpeed()" type="range" min="0.02" max="2.0" step="0.02" style="margin-bottom:-0.25em;" id="fruiting_speed_slider" />
		<output for="fruiting_speed_slider" id="fruiting_speed_slider_output">{{vars.fruiting_speed.toFixed(2)}}x</output>

		<br/>

		<label for="num_rocks_slider">Rocks</label>
		<input v-model.number="vars.num_rocks" @change="updateNumRocks()" type="range" min="0" max="100" step="1" style="margin-bottom:-0.25em;" id="num_rocks_slider" />
		<output for="num_rocks_slider" id="num_rocks_slider_output">{{vars.num_rocks}}</output>

		<br/>

		<label for="num_plants_slider">Plants</label>
		<input v-model.number="vars.num_plants" @change="updateNumPlants()" type="range" min="0" max="200" step="1" style="margin-bottom:-0.25em;" id="num_plants_slider" />
		<output for="num_plants_slider" id="num_plants_slider_output">{{vars.num_plants}}</output>

		<br/>

		<div v-if="vars.time">
			<label for="round_time_slider">Timeout</label>
			<input v-model.number="vars.time" @change="updateTimeout()" type="range" min="1" max="180" step="1" style="margin-bottom:-0.25em;" id="round_time_slider" />
			<output for="round_time_slider" id="round_time_slider_output">{{vars.time}}</output>
		</div>

		<br/>

		<p v-if="vars.name"><output>{{vars.name}}</output></p>
		
		
		<div v-if="vars.time">
			<div v-if="vars.segments">
				Segments: <output id="segments_output">{{vars.segments}}</output>
			</div>
			Round: <output id="round_output">{{vars.round.num}}</output> / 
				<output id="round_output">{{vars.rounds||'∞'}}</output> | 
			Best: <output id="best_score_output">{{vars.round.best_score.toFixed()}}</output> | 
			Avg: <output id="avg_score_output">{{vars.round.avg_score.toFixed()}}</output>
		</div>

		<div v-if="vars.time">
			Sim Best: <output id="total_score_output">{{vars.best_score.toFixed()}}</output> | 
			Best Avg: <output id="best_avg_score_output">{{vars.best_avg_score.toFixed()}}</output>
		</div>
		
		T: <output id="sim_time_output">{{vars.round.time.toFixed(1)}}</output> | 
		F: <output id="framenum_output">{{vars.framenum}}</output> |  
		FPS: <output id="fps_output">{{vars.fps}}</output> 

		<br/>

		Cam: 
			<output>{{(vars.camx||0).toFixed(0)}}x</output>, 
			<output>{{(vars.camy||0).toFixed(0)}}y</output>, 
			<output>{{(vars.camz||0).toFixed(2)}}z</output> 
			<output v-show="vars.cinema_mode" style="line-height:1em;"> Ⓒ</output>

		<br/>
		
		Screen: 
			[<output>{{(vars.xmin||0).toFixed(0)}}</output>,<output>{{(vars.ymin||0).toFixed(0)}}</output>] 
			[<output>{{(vars.xmax||0).toFixed(0)}}</output>,<output>{{(vars.ymax||0).toFixed(0)}}</output>]
		<br/>
		<canvas id="simulatorChart" style="width: 100%; height: 6em;"></canvas> 
	</div>
	  
			  
</template>
