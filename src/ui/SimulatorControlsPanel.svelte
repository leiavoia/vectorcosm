<script>

	let { settings: settings_raw, onupdate } = $props();
	
	// get access to the app's innards so buttons can do something useful
	import { getContext } from 'svelte';
	const gameloop = getContext('gameloop');
	const api = getContext('api');
	
	let settings = $state({
		volume: (settings_raw?.volume ?? 2500000),
		num_boids: (settings_raw?.num_boids ?? 0),
		num_plants: (settings_raw?.num_plants ?? 0),
		num_rocks: (settings_raw?.num_rocks ?? 0),
		max_mutation: (settings_raw?.max_mutation ?? 0.2),
		cullpct: (settings_raw?.cullpct ?? 0.2),
		timeout: (settings_raw?.timeout ?? 60),
		rounds: (settings_raw?.rounds ?? 50),
		fruiting_speed: (settings_raw?.fruiting_speed ?? 1.0),
		current: (settings_raw?.current ?? 0),
		segments: (settings_raw?.segments ?? 1),
		sim_meta_params: {
			num_boids: (settings_raw?.sim_meta_params?.num_boids ?? null),
			segments: (settings_raw?.sim_meta_params?.segments ?? 1),
		}
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
	
	function togglePause() {
		gameloop.playing = !gameloop.playing;
		if ( gameloop.playing ) { gameloop.Start(); }
	}
	
	function toggleFF() {
		gameloop.updates_per_frame = gameloop.updates_per_frame > 1 ? 1 : 200;
	}
	
	function endSim() {
		api.SendMessage('endSim',null);
	}
	
	function saveTank() {
		api.SendMessage('exportTank',null);
		// this is going to return JSON that we need to store in localStorage.
		// webworker does not have access to localStorage.
		// the main app already handles this event so we don't need to do anything here.
	}
	
	function loadTank() {
		const tank = globalThis.localStorage.getItem("tank");
		if ( tank ) {
			api.SendMessage('loadTank', { tank, settings: $state.snapshot(settings) });
		}
	}
	
	function randTank() {
		api.SendMessage('randTank',null);
	}
	
</script>

<style>

</style>

<section>
	<nav>
		<ul>
			<li><button class="" onclick={togglePause}>Pause</li>
			<li><button class="" onclick={toggleFF}>FF</li>
			<li><button class="" onclick={endSim}>End</li>
			<li><button class="" onclick={saveTank}>Save</li>
			<li><button class="" onclick={loadTank}>Load</li>
			<li><button class="" onclick={randTank}>Rand</li>
		</ul>
	</nav>
</section>

<section>
				
	<header>
		<h3>Settings</h3>
	</header>
	
	<div class="slider_block">
		<label for="volume_slider">Tank Size:</label>
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
		<label for="fruiting_speed_rate_slider">Fruiting:</label>
		<input bind:value={settings.fruiting_speed} onchange={()=>onchange('fruiting_speed')} type="range" min="0" max="2" step="0.05" id="fruiting_speed_rate_slider" />
		<output>{((settings?.fruiting_speed||0)*100).toFixed()}%</output>
	</div>		
	
	<div class="slider_block">
		<label for="current_rate_slider">Current:</label>
		<input bind:value={settings.current} onchange={()=>onchange('current')} type="range" min="0" max="2" step="0.05" id="current_rate_slider" />
		<output>{((settings?.current||0)*100).toFixed()}%</output>
	</div>		
	
	<!-- these setting only apply to round-based training sims -->
	{#if settings.timeout!==0}
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
			<label for="segments_rate_slider">Segments:</label>
			<input bind:value={settings.segments} onchange={()=>onchange('segments')} type="range" min="1" max="16" step="1" id="segments_rate_slider" />
			<output>{(settings?.segments||0).toFixed()}</output>
		</div>		
	{/if}		
			
</section>