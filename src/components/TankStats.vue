<script setup>
	// import * as Chart from "chart.js";
	// import Chart from 'chart.js/auto';
	// you can optimize package size by not including everything. see:
	// https://www.chartjs.org/docs/latest/getting-started/integration.html
	import * as utils from '../util/utils.js'
	import Tank from '../classes/class.Tank.js'
	import Simulation from '../classes/class.Simulation.js'
	import { ref, reactive, markRaw, shallowRef, nextTick, triggerRef, onMounted, watch } from 'vue'
	import PubSub from 'pubsub-js'
	
	// graphing and chart setup				
	// Chart.defaults.color = '#FFF';
	// Chart.defaults.elements.line.backgroundColor = '#41A34F';
	// Chart.defaults.elements.line.borderColor = '#41A34F';
	// Chart.defaults.elements.bar.backgroundColor = '#41A34F';
	// Chart.defaults.elements.bar.borderColor = '#41A34F';
	// Chart.defaults.elements.point.radius = 0;
	
	let props = defineProps(['sim']);
	
	let vars = reactive({
		num_boids: 0,
		boid_mass: 0,
		num_foods: 0,
		num_species: 0,
		food_value: 0,
		num_plants: 0,
		num_rocks: 0,
		tank_width: 0,
		tank_height: 0,
	});
	
	// will be created by Chart.js after DOM loads
	// let simulatorChart = null;
		
	function copyStats() {
		const species = new Map;
		for ( let b of props.sim.tank.boids ) {
			species.set( b.species, (species.get(b.species)||0) + 1 );
		}
		vars.num_boids = props.sim.tank.boids.length;
		vars.num_species = species.size;
		vars.num_foods = props.sim.tank.foods.length;
		vars.num_plants = props.sim.tank.plants.length;
		vars.num_rocks = props.sim.tank.obstacles.length;
		vars.food_value = Math.trunc( props.sim.tank.foods.reduce( (total,x) => total + x.value, 0 ) );
		vars.boid_mass = Math.trunc( props.sim.tank.boids.reduce( (total,x) => total + x.mass, 0 ) );
		vars.tank_width = props.sim.tank.width;
		vars.tank_height = props.sim.tank.height;
	}
	
	let frameUpdateSubscription = PubSub.subscribe('frame-update', (msg,data) => {
		if ( props.sim ) {
			copyStats();
		}
		// props.sim.onRound = _ => {
		// 	simulatorChart.data.labels.push(props.sim.stats.round.num);
		// 	simulatorChart.update();
		// };
		// copyPropsFromSim();
		// if ( simulatorChart ) { 
		// 	simulatorChart.destroy();
		// 	simulatorChart = MakeSimulatorChart('simulatorChart', props.sim.stats.chartdata.averages, props.sim.stats.chartdata.highscores);
		// }
	});
	
	// onMounted(() => {
	// 	// simulatorChart = MakeSimulatorChart('simulatorChart', props.sim.stats.chartdata.averages, props.sim.stats.chartdata.highscores);
	// });
	
	// function MakeSimulatorChart( element_id, averages, highscores ) {

	// 	const chartdata = {
	// 		labels: [],
	// 		datasets: [
	// 			{
	// 				label: 'Average',
	// 				backgroundColor: '#3DAEE9',
	// 				borderColor: '#3DAEE9',
	// 				borderWidth: 1,
	// 				fill:true,
	// 				data: averages,
	// 				order: 2,
	// 				tension: 0.2,
	// 			},
	// 			{
	// 				label: 'Best',
	// 				backgroundColor: '#55EEFF33',
	// 				borderColor: '#55EEFF33',
	// 				borderWidth: 1,
	// 				fill:true,
	// 				tension: 0.2,
	// 				data: highscores,
	// 			},
	// 		]
	// 	};
	// 	const chartconfig = {
	// 		type: 'line',
	// 		data: chartdata,
	// 		options: {
	// 			responsive: false,
	// 			aspectRatio: 2.5,
	// 			interaction: {
	// 				intersect: false,
	// 			},					
	// 			plugins: {
	// 				legend: {
	// 					position: 'top',
	// 					display:false,
	// 				},
	// 				title: {
	// 					display: false,
	// 				}
	// 			},
	// 			scales: {
	// 				x: { display: false },
	// 				y: { display: false }
	// 			}				
	// 		}
	// 	};
	// 	return new Chart( document.getElementById(element_id), chartconfig );
	// }
				
</script>

<template>
	<div>
		<h2>Tank</h2>
		<p>Boids: <output>{{vars.num_boids.toLocaleString()}}</output></p>
		<p>Species: <output>{{vars.num_species.toLocaleString()}}</output></p>
		<p>Plants: <output>{{vars.num_plants.toLocaleString()}}</output></p>
		<p>Rocks: <output>{{vars.num_rocks.toLocaleString()}}</output></p>
		<p>Fruit: <output>{{vars.num_foods.toLocaleString()}}</output></p>
		<p>Boid Mass: <output>{{vars.boid_mass.toLocaleString()}}</output></p>
		<p>Food Mass: <output>{{vars.food_value.toLocaleString()}}</output></p>
		<p>Tank Size: <output>{{vars.tank_width.toLocaleString()}} x {{vars.tank_height.toLocaleString()}}</output></p>
		<!-- <canvas id="simulatorChart" style="width: 12em; height: 4em;"></canvas>  -->
	</div>  
</template>
