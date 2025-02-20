<script>

	import { onMount } from 'svelte';
	import Chart from 'chart.js/auto';
	
	let {stats, chartdata} = $props();
	
	let chartcanvas;
    let simulatorChart;
	
	Chart.defaults.color = '#FFF';
	Chart.defaults.elements.line.backgroundColor = '#41A34F';
	Chart.defaults.elements.line.borderColor = '#41A34F';
	Chart.defaults.elements.bar.backgroundColor = '#41A34F';
	Chart.defaults.elements.bar.borderColor = '#41A34F';
	Chart.defaults.elements.point.radius = 0;
			 
	onMount(() => {
		simulatorChart = MakeSimulatorChart(chartcanvas, chartdata.averages, chartdata.highscores, chartdata.labels);	
	});
				
	export function onRoundComplete() {
		simulatorChart.update();
	}
	
	function MakeSimulatorChart( element, averages, highscores, labels=[] ) {

		const chartdata = {
			labels,
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
		return new Chart( element.getContext('2d'), chartconfig );
	}
					
</script>

<style>
	
</style>

<section>
	<header>
		<h3>Simulation</h3>
	</header>
	<p><output>{stats.name}</output></p>
	
	Time: <output id="sim_time_output">{stats.round_time.toFixed(1)}</output>
	{#if stats.settings.timeout} / <output>{stats.settings.timeout}</output>{/if}
	
	{#if stats.settings.timeout}
		<br/>
		{#if stats.segments > 1}
			<br/>
			Segments: <output id="segments_output">{stats.segments}</output>
		{/if}
		Round: <output id="round_output">{stats.round_num}</output> / <output id="round_output">{stats.settings.rounds||'∞'}</output><br/>
		Best: <output id="best_score_output">{stats.round_best_score.toFixed()}</output> | 
		Avg: <output id="avg_score_output">{stats.round_avg_score.toFixed()}</output>
	{/if}

	{#if stats.settings.timeout}
		<br/>
		Sim Best: <output id="total_score_output">{stats.best_score.toFixed()}</output> | 
		Best Avg: <output id="best_avg_score_output">{stats.best_avg_score.toFixed()}</output>
	{/if}

	{#if stats.sims_in_queue}
		<br/>
		Next: <output id="total_score_output">{stats.sims_in_queue}</output>
	{/if}
	
	<br/>
	Frame: <output id="framenum_output">{stats.framenum}</output> | 
	FPS: <output id="framenum_output">{stats.fps}</output>
	
	<canvas bind:this={chartcanvas} style="width: 100%; height: 6em; margin-top:1rem;"></canvas> 
</section>	
