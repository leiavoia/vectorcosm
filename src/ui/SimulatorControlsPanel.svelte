<script>

	let { settings: settings_raw, onupdate } = $props();
	let settings = $state({
		volume: 2500000,
		num_boids: 0,
		num_plants: 0,
		num_rocks: 0,
		max_mutation: 0.2,
		cullpct: 0.2,
		timeout: 60,
		rounds: 50,
		fruiting_speed: 1.0,
		segments:1,
	});
	
	// when params are updated from the server, update our local set of variables
	$effect( () => {
		for ( let k in settings_raw ) {
			settings[k] = settings_raw[k];
		}
	});
	
	// when we adjust local settings, let the server know
	function onchange(k) {
		onupdate({ [k]: settings[k] });
	};
	
</script>

<style>

</style>

<section>
	<nav>
		<ul>
			<li><button class="secondary">Pause</li>
			<li><button class="secondary">FF</li>
			<li><button class="secondary">End</li>
			<!-- <li><button class="secondary">Save</li> -->
			<!-- <li><button class="secondary">Load</li> -->
			<li><button class="secondary">Rand</li>
			<li><button class="secondary">X</li>
		</ul>
	</nav>
</section>

<section>
				
	<header>
		<h3>Settings</h3>
	</header>
	
	<div class="slider_block">
		<label for="volume_slider">Volume:</label>
		<input bind:value={settings.volume} onchange={()=>onchange('volume')} type="range" min="1000000" max="50000000" step="500000" id="volume_slider" />
		<output>{((settings.volume||0)/1000000).toFixed(1)}K</output>
	</div>
	
	<div class="slider_block">
		<label for="num_boids_slider">Boids:</label>
		<input bind:value={settings.num_boids} onchange={()=>onchange('num_boids')} type="range" min="0" max="300" step="1" id="num_boids_slider" />
		<output>{settings?.num_boids||0}</output>
	</div>
	
	<div class="slider_block">
		<label for="num_plants_slider">Plants:</label>
		<input bind:value={settings.num_plants} onchange={()=>onchange('num_plants')} type="range" min="0" max="300" step="1" id="num_plants_slider" />
		<output>{settings?.num_plants||0}</output>
	</div>
	
	<div class="slider_block">
		<label for="num_rocks_slider">Rocks:</label>
		<input bind:value={settings.num_rocks} onchange={()=>onchange('num_rocks')} type="range" min="0" max="100" step="1" id="num_rocks_slider" />
		<output>{settings?.num_rocks||0}</output>
	</div>
	
	<div class="slider_block">
		<label for="mutation_rate_slider">Mutation:</label>
		<input bind:value={settings.max_mutation} onchange={()=>onchange('max_mutation')} type="range" min="0" max="1" step="0.02" id="mutation_rate_slider" />
		<output>{((settings?.max_mutation||0)*100).toFixed()}%</output>
	</div>									
	
	<div class="slider_block">
		<label for="culling_rate_slider">Culling:</label>
		<input bind:value={settings.cullpct} onchange={()=>onchange('cullpct')} type="range" min="0" max="1" step="0.02" id="culling_rate_slider" />
		<output>{((settings?.cullpct||0)*100).toFixed()}%</output>
	</div>		
	
	<div class="slider_block">
		<label for="timeout_rate_slider">Timeout:</label>
		<input bind:value={settings.timeout} onchange={()=>onchange('timeout')} type="range" min="0" max="200" step="1" id="timeout_rate_slider" />
		<output>{(settings?.timeout||0).toFixed()}</output>
	</div>		
	
	<div class="slider_block">
		<label for="rounds_rate_slider">Rounds:</label>
		<input bind:value={settings.rounds} onchange={()=>onchange('rounds')} type="range" min="0" max="500" step="1" id="rounds_rate_slider" />
		<output>{(settings?.rounds||0).toFixed()}</output>
	</div>		
	
	<div class="slider_block">
		<label for="fruiting_speed_rate_slider">Fruiting:</label>
		<input bind:value={settings.fruiting_speed} onchange={()=>onchange('fruiting_speed')} type="range" min="0" max="2" step="0.05" id="fruiting_speed_rate_slider" />
		<output>{((settings?.fruiting_speed||0)*100).toFixed()}%</output>
	</div>		
	
	<div class="slider_block">
		<label for="segments_rate_slider">Segments:</label>
		<input bind:value={settings.segments} onchange={()=>onchange('segments')} type="range" min="1" max="16" step="1" id="segments_rate_slider" />
		<output>{(settings?.segments||0).toFixed()}</output>
	</div>		
			
</section>