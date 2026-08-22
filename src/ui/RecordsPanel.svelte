<script>

	import { onMount, onDestroy } from 'svelte';
	import Chart from 'chart.js/auto';
	import { LoadUIState, SaveUIState } from '../util/ui-state.js';
	
	let {records, open=true} = $props();
	// LoadUIState is synchronous, so seed isOpen directly (open is only used as a fallback default, snapshotted once).
	// svelte-ignore state_referenced_locally
	let isOpen = $state(LoadUIState('panel.records.open', open, value => typeof value == 'boolean' ? value : open));
	
	let chartcanvas;
    let simulatorChart;
	let layerOnDisplay = $state(LoadUIState('panel.records.layer', 0, value => Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0)); 
	let recordsPerLayer = 30; 
	const datasets = []; // used by the chart. data copied from records trackers
	const chartlabels = []; // used by the chart. "labels" are actually timestamps or turns
					
	Chart.defaults.color = '#FFF';
	Chart.defaults.elements.point.radius = 0;
			 
	onMount(() => {
		simulatorChart = MakeSimulatorChart(chartcanvas, records);
		preloadChartData(records);
		simulatorChart.update(); // render manually
		// attach an insert handler if the tracker does not already have one
		if ( !records?.onInsert ) {
			records.onInsert = ( data, layer ) => {
				// update graph if the layer that got the insert is the layer we are watching
				if ( layer == layerOnDisplay ) {
					// update each stat - TODO: could be optimized for speed
					for ( let k in data ) {
						// find the dataset that matches the record key
						const dataset = datasets.find( d => d.label == k );
						if ( dataset ) {
							while ( dataset.data.length >= recordsPerLayer ) {
								dataset.data.shift();
							}
							dataset.data.push( data[k] );
						}
					}
					// add another label to push the chart forward
					const next_index = chartlabels.length-1;
					const next_label = next_index < 0 ? 0 : chartlabels[ next_index ];
					while ( chartlabels.length >= recordsPerLayer ) {
						chartlabels.shift();
					}
					chartlabels.push( next_label );
					// trigger the visual update
					simulatorChart.update(); 
				}
			};
		}
	});
			
	onDestroy(() => {
		records.onInsert = null;
	})	

	$effect(() => {
		SaveUIState('panel.records.open', isOpen);
	});

	$effect(() => {
		SaveUIState('panel.records.layer', layerOnDisplay);
	});
	
	// use this function to load chart data from the tracker 
	// when the widget is created in order to present a complete chart		
	function preloadChartData( records ) {
		 chartlabels.length = 0; // reset chart labels
		 // loop through each chart dataset, find the matching tracker by name,
		 for ( let ds of datasets ) {
			const tracker = records.trackers[ds.label];
			if ( tracker ) {
				// get the data for the current layer
				const data = tracker.layers[layerOnDisplay];
				if ( data ) {
					// copy the data into the dataset
					ds.data = data.slice(0, recordsPerLayer);
					// add the labels if they don't exist
					if ( chartlabels.length == 0 ) {
						// create labels based on the data length
						for ( let i = 0; i < ds.data.length; i++ ) {
							chartlabels.push( i );
						}
					}
				}
			}
		 }			 
	}
			
	function MakeSimulatorChart( element, records ) {
		
		// maps specific datasets to specific colors
		const axis_colors = {
			'boids':		'#1472bc',
			'foods':		'#d9900c',
			'plants':		'#00C955',
			'boid_mass':	'#4AB9F7',
			'food_mass':	'#DEDD41',
			'plant_core':	'#0B650F',
			'foliage':		'#8BC34A',
			'species':		'#CD5FD0',
			'births':		'#EEEEEE',
			'deaths':		'#787878',
			'food_eaten':	'#9C6307',
			'energy_used':	'#B1C844',
			'bites':		'#987E2F',
			'kills':		'#DD1111',
			'avg_age':		'#5429B8',
		}
				
		// fixed set of colors for any dynamic datasets we dont know about
		const colors = [
			'#FF6F61', // coral red
			'#6FCF97', // green
			'#56CCF2', // blue
			'#F2C94C', // yellow
			'#45B8AC', // teal
			'#BB6BD9', // purple
			'#F2994A', // orange
			'#2D9CDB', // azure
			'#27AE60', // emerald
			'#EB5757', // crimson
			'#9B51E0', // violet
			'#F7B731', // gold
			'#00B894', // turquoise
			'#0984E3', // sapphire
			'#FD7272', // pink
			'#00CEC9', // aqua
			'#636E72', // slate
			'#E17055', // salmon
			'#B2BEC3', // silver
			'#D35400', // pumpkin
		];
		let next_color = 0;
		
		// we need to create each dataset with its own y axis.
		// some datasets logically share the same scale. 
		// others will be created on the fly
		const axes = {
			x: { display: false },
			y_small_nums: { display: false }, // <20
			y_med_nums: { display: false }, // 0-500
			y_large_nums: { display: false }, // thousands
			y_mass: { display: false }, // boids and food
			// add named custom y axes as we go
		};
		
		// maps certain datasets to named axis 
		const axis_map = {
			'boids':		'y_med_nums',
			'foods':		'y_med_nums',
			'plants':		'y_med_nums',
			'boid_mass':	'y_mass',
			'food_mass':	'y_mass',
			'species':		'y_small_nums',
			'births':		'y_small_nums',
			'deaths':		'y_small_nums',
			'food_eaten':	'y_large_nums',
			'energy_used':	'y_large_nums',
			'bites':		'y_med_nums',
			'kills':		'y_small_nums',
			// 'avg_age':		'',
		}
		
		// these datasets are on by default. all others must be toggled on
		const visible_datasets = [/* 'boids','foods', */'boid_mass','food_mass'];
		// load persisted label visibility, fall back to visible_datasets defaults
		const saved_hidden = LoadUIState('panel.records.chart.hidden', null, v => v && typeof v == 'object' && !Array.isArray(v) ? v : null);
		
		// create the data sets based on record trackers.
		// each tracker tracks a set of named statistics.
		// each stat has 4 layers of data (fine grained to general)
		for ( let k in records.trackers ) {
			let yAxisID = `y-${k}`;
			// use a named axis if one makes sense
			if ( k in axis_map ) {
				yAxisID = axis_map[k];
			}
			// create an independent Y Axis
			else {
				axes[yAxisID] = { display: false };
			}
			// use a designated color if possible, dynamic otherwise
			let color = ( k in axis_colors) ? axis_colors[k] : colors[next_color++ % colors.length];
			// create the dataset
			const dataset = {
				label: k,
				data: [], // will populate later
				backgroundColor: color,
				borderColor: color,
				borderWidth: 3,
				fill:false,
				tension: 0.2,
				yAxisID: yAxisID,
				hidden: saved_hidden && k in saved_hidden ? saved_hidden[k] : !visible_datasets.contains(k)
			};
			datasets.push(dataset);
			++next_color;
		}
		
		// define a custom plugin to paint the chart background color
		const customBackgroundColorPlugin = {
			id: 'customBackgroundColor',
			beforeDraw: (chart, args, options) => {
				const ctx = chart.ctx;
				const chartArea = chart.chartArea;
				if (chartArea) {
					ctx.save();
					ctx.globalCompositeOperation = 'destination-over';
					ctx.fillStyle = options.color || '#000';
					ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
					ctx.restore();
				}
			}
		};
		
		// options and setup
		const chartdata = { labels: chartlabels, datasets };
		const chartconfig = {
			type: 'line',
			data: chartdata,
			plugins: [customBackgroundColorPlugin],
			options: {
				responsive: false,
				aspectRatio: 2.5,
				interaction: {
					intersect: false,
				},
				plugins: {
					customBackgroundColor: { color: '#00000055'},
					legend: {
						position: 'bottom',
						display:true,
						onClick: (e, legendItem, legend) => {
							// default toggle: show/hide the clicked dataset
							const ci = legend.chart;
							const index = legendItem.datasetIndex;
							if ( ci.isDatasetVisible(index) ) {
								ci.hide(index);
								legendItem.hidden = true;
							}
							else {
								ci.show(index);
								legendItem.hidden = false;
							}
							// persist new visibility state for all labels
							const hidden_state = {};
							ci.data.datasets.forEach((ds, i) => { hidden_state[ds.label] = !ci.isDatasetVisible(i); });
							SaveUIState('panel.records.chart.hidden', hidden_state);
						},
						labels: {
							color: '#FFFFFF',
							// font: {
								// size: 10,
								// weight: 'bold'
							// },
							boxWidth: 10,
							boxHeight: 10,
							padding: 10,
							usePointStyle: false,
							// generateLabels: (chart) => {
							// 	// generate labels for the legend
							// 	return chart.data.datasets.map((dataset, index) => {
							// 		return {
							// 			text: dataset.label,
							// 			fillStyle: dataset.backgroundColor,
							// 			strokeStyle: dataset.borderColor,
							// 			lineWidth: dataset.borderWidth,
							// 			index: index
							// 		};
							// 	});
							// }
						}
					},
					title: {
						display: false,
					}
				},
				scales: axes				
			}
		};
		return new Chart( element.getContext('2d'), chartconfig );
	}
					
	function SwitchLayer(layer) {
		layerOnDisplay = layer;
		preloadChartData(records);
		simulatorChart.update(); 
	}
	
</script>

<style>
	
</style>

<section class={{nocontent:!open}}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<header 
		onclick={()=>open=!open}
		onkeydown={(event) => {
			if ( event.key == 'Enter' || event.key == ' ' ) {
				event.preventDefault();
				isOpen = !isOpen;
			}
		}}
		tabindex="0"
	>
		<h3>Records</h3>
	</header>
	<!-- note: we can't remove this from the dom because the chart needs to remain available for updates even when hidden -->
	<div style="display: {isOpen ? 'block' : 'none'}">
		<div class="button_rack">
			<button onclick={()=>SwitchLayer(0)} class={{outline:layerOnDisplay!==0}}>Short</button>
			<button onclick={()=>SwitchLayer(1)} class={{outline:layerOnDisplay!==1}}>Medium</button>
			<button onclick={()=>SwitchLayer(2)} class={{outline:layerOnDisplay!==2}}>Long</button>
			<button onclick={()=>SwitchLayer(3)} class={{outline:layerOnDisplay!==3}}>Epoch</button>
		</div>
		<!-- <div> -->
			<canvas bind:this={chartcanvas} style="
				width: 100%; 
				height: 18em; 
				margin-top:1rem; 
			"></canvas> 
		<!-- </div> -->
	</div>
</section>	
