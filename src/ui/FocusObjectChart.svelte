<script>
	import Chart from "chart.js/auto";
	import { onMount, onDestroy } from "svelte";

	// records is a compound stat tracker that the parent maintains
	let { records } = $props();
	
	// this allows tabbing through multiple epochs on the stat tracker
	let layerOnDisplay = $state(0); 
	
	// chart stuff	
	Chart.defaults.color = '#FFF';
	Chart.defaults.elements.point.radius = 0;
	let chartcanvas;
	let chart;
	const datasets = []; // used by the chart. data copied from records trackers
	const chartlabels = []; // used by the chart. "labels" are actually timestamps or turns
	let recordsPerLayer = 60; 
		
	// set up the chart
    onMount(() => {
        if ( chartcanvas && records ) {
			// respect the tracker settings
			const example = records.FirstTracker();
			recordsPerLayer = example.recordsPerLayer;
			resetChartData();
			chart = Makechart( chartcanvas, records ) ;
			return () => chart.destroy();
		}
    });

	onDestroy(() => {
		if ( records ) {
			records.onInsert = null; 
		}
		if ( chart ) {
			chart.destroy();
		}
	});
	
	// records has either been replaced or added to
    $effect(() => {
		// if it was recently replaced
		if ( records && !records?.onInsert ) {
			// respect the tracker settings
			const example = records.FirstTracker();
			recordsPerLayer = example.recordsPerLayer;
			// hook up a new onInsert
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
					if ( chart ) { chart.update(); }
				}
			};
			// reset the chart data because we have an entirely new dataset
			resetChartData();
		}
		// make sure chart is set up
		if ( !chart && records && chartcanvas ) {
			chart = Makechart( chartcanvas, records ) ;
		}
		if ( chart ) { chart.update(); }
		// we want animated updates after unanimated startup
		if ( !chart.options.animation ) {
			chart.options.animation = true;
		}
    });
	
	// tab through layer epochs				
	function SwitchLayer(layer) {
		layerOnDisplay = layer;
		resetChartData();
		if ( chart ) chart.update(); 
	}
		
	// use this function to load chart data from the tracker 
	// when the widget is created in order to present a complete chart		
	function resetChartData() {	
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
	
	function Makechart( element, records ) {
		
		// maps specific datasets to specific colors
		const axis_colors = {
			'boids':		'#1472bc',
			'foods':		'#d9900c',
			'plants':		'#00C955',
			'boid_mass':	'#4AB9F7',
			'food_mass':	'#DEDD41',
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
			y_pct: { display: false, beginAtZero:true, min:0, max:1 }, // 0..1 for percentage values
			y_small_nums: { display: false, beginAtZero:true }, // <20
			y_med_nums: { display: false, beginAtZero:true }, // 0-500
			y_large_nums: { display: false, beginAtZero:true }, // thousands
			y_mass: { display: false, beginAtZero:true }, // boids and food
			// add named custom y axes as we go
		};
		
		// maps certain datasets to named axis 
		const axis_map = {
			// tank stats
			'boids':			'y_med_nums',
			'foods':			'y_med_nums',
			'plants':			'y_med_nums',
			'boid_mass':		'y_mass',
			'food_mass':		'y_mass',
			'species':			'y_small_nums',
			'births':			'y_small_nums',
			'deaths':			'y_small_nums',
			'food_eaten':		'y_large_nums',
			'energy_used':		'y_large_nums',
			'bites':			'y_med_nums',
			'kills':			'y_small_nums',
			// boid stats
			'health':			'y_pct',
			'life':				'y_pct',
			'stomach':			'y_pct',
			'scale':			'y_pct',  
			'energy_pct':		'y_pct',
			'mass':				'y_mass',  
			'bites':			'y_small_nums', 
			'digest.total':		'y_med_nums', 
			'digest.inedible':	'y_med_nums', 
			'digest.edible':	'y_med_nums', 
			'digest.toxins':	'y_med_nums', 
			'food_eaten':		'y_med_nums', 
			'toxins':			'y_med_nums', 
			'deficient':		'y_med_nums', 
			'metab.base':		'y_med_nums', 
			'metab.motors':		'y_med_nums', 
		}
					
		// these datasets are on by default. all others must be toggled on
		const visible_datasets = ['health','life','stomach','scale','energy_pct'];
		
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
				hidden: !visible_datasets.contains(k)
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
				animation: false,
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
	
</script>

<div class="button_rack">
	<button onclick={()=>SwitchLayer(0)} class={{secondary:true,outline:layerOnDisplay!==0}}>Recent</button>
	<button onclick={()=>SwitchLayer(1)} class={{secondary:true,outline:layerOnDisplay!==1}}>Lifetime</button>
</div>
		
<div>
	<canvas bind:this={chartcanvas} style="
		width: 100%; 
		height: 18em; 
		margin-top:1rem; 
	"></canvas>
</div>