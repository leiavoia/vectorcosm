<script>

	let { settings: settings_raw, onSettingsChanged, open=true } = $props();
	
	// get access to the app's innards so buttons can do something useful
	import { getContext } from 'svelte';
	const gameloop = getContext('gameloop');
	const api = getContext('api');

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
		current: 0,
		viscosity: 0,
		segments: 1,
	});

	// dragging guard: block worker pushes from stomping slider values mid-drag
	let dragging = $state(false);

	// sync from parent whenever simulation pushes new settings, but not during active drag
	$effect(() => {
		if ( !dragging ) { Object.assign(settings, settings_raw); }
	});

	// let server know about our settings changes
	function CommitSettingChange(k) {
		onSettingsChanged?.({ [k]: settings[k] });
	}
	
	function togglePause() {
		gameloop.playing = !gameloop.playing;
		if ( gameloop.playing ) { gameloop.Start(); }
	}
	
	function toggleFF() {
		gameloop.updates_per_frame = gameloop.updates_per_frame > 1 ? 1 : 200;
	}
	
	function endSim() {
		api.send('end_sim');
	}
	
	function saveTank() {
		api.call('save_tank').then(data => { /* saved */ });
	}
	
	function loadTank() {
		api.send('load_tank', { id:0, settings: $state.snapshot(settings) });
	}
	
	function randTank() {
		api.send('rand_tank');
	}
	
</script>

<style>
	.slider_block LABEL {
		width: 6rem;
	}
	.slider_block OUTPUT {
		width: 4rem;
	}
</style>

<section>
	<nav>
		<ul>
			<li><button class="" onclick={togglePause}>Pause</button></li>
			<li><button class="" onclick={toggleFF}>FF</button></li>
			<li><button class="" onclick={endSim}>End</button></li>
			<li><button class="" onclick={saveTank}>Save</button></li>
			<li><button class="" onclick={loadTank}>Load</button></li>
			<li><button class="" onclick={randTank}>Rand</button></li>
		</ul>
	</nav>
</section>

<section>
				
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<header 
		onclick={()=>open=!open}
		onkeydown={(event) => {
			if ( event.key == 'Enter' || event.key == ' ' ) {
				event.preventDefault();
				open = !open;
			}
		}}
		tabindex="0"
	>
		<h3>
			Settings
			{#if !open}
				<small class="dim"> 
					| B:{settings.num_boids}, 
					Mut:{(settings.max_mutation*100).toFixed()}, 
					Fr:{(settings.fruiting_speed*100).toFixed()}
				</small>
			{/if}
		</h3>
	</header>
	
	{#if open}
		<div class="slider_block">
			<label for="volume_slider">Tank Size:</label>
			<input bind:value={settings.volume} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('volume')} type="range" min="1000000" max="100000000" step="500000" id="volume_slider" />
			<output>{((settings.volume||0)/1000000).toFixed(1)}K</output>
		</div>
		
		<div class="slider_block">
			<label for="num_boids_slider">Boids:</label>
			<input bind:value={settings.num_boids} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('num_boids')} type="range" min="0" max="300" step="1" id="num_boids_slider" />
			<output>{settings.num_boids||0}</output>
		</div>
		
		<div class="slider_block">
			<label for="num_plants_slider">Plants:</label>
			<input bind:value={settings.num_plants} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('num_plants')} type="range" min="0" max="300" step="1" id="num_plants_slider" />
			<output>{settings.num_plants||0}</output>
		</div>
		
		<div class="slider_block">
			<label for="num_rocks_slider">Rocks:</label>
			<input bind:value={settings.num_rocks} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('num_rocks')} type="range" min="0" max="100" step="1" id="num_rocks_slider" />
			<output>{settings.num_rocks||0}</output>
		</div>
		
		<div class="slider_block">
			<label for="mutation_rate_slider">Mutation:</label>
			<input bind:value={settings.max_mutation} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('max_mutation')} type="range" min="0" max="1" step="0.02" id="mutation_rate_slider" />
			<output>{((settings.max_mutation||0)*100).toFixed()}%</output>
		</div>									
		
		<div class="slider_block">
			<label for="fruiting_speed_rate_slider">Fruiting:</label>
			<input bind:value={settings.fruiting_speed} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('fruiting_speed')} type="range" min="0" max="2" step="0.05" id="fruiting_speed_rate_slider" />
			<output>{((settings.fruiting_speed||0)*100).toFixed()}%</output>
		</div>		
		
		<div class="slider_block">
			<label for="current_rate_slider">Current:</label>
			<input bind:value={settings.current} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('current')} type="range" min="0" max="2" step="0.05" id="current_rate_slider" />
			<output>{((settings.current||0)*100).toFixed()}%</output>
		</div>		
		
		<div class="slider_block">
			<label for="viscosity_slider">Viscosity:</label>
			<input bind:value={settings.viscosity} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('viscosity')} type="range" min="0" max="1" step="0.01" />
			<output>{((settings.viscosity||0)*100).toFixed()}%</output>
		</div>		
		
		<!-- these setting only apply to round-based training sims -->
		{#if settings.timeout!==0}
			<div class="slider_block">
				<label for="culling_rate_slider">Culling:</label>
				<input bind:value={settings.cullpct} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('cullpct')} type="range" min="0" max="1" step="0.02" id="culling_rate_slider" />
				<output>{((settings.cullpct||0)*100).toFixed()}%</output>
			</div>
			
			<div class="slider_block">
				<label for="timeout_rate_slider">Timeout:</label>
				<input bind:value={settings.timeout} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('timeout')} type="range" min="0" max="200" step="1" id="timeout_rate_slider" />
				<output>{(settings.timeout||0).toFixed()}</output>
			</div>		
			
			<div class="slider_block">
				<label for="rounds_rate_slider">Rounds:</label>
				<input bind:value={settings.rounds} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('rounds')} type="range" min="0" max="500" step="1" id="rounds_rate_slider" />
				<output>{(settings.rounds||0).toFixed()}</output>
			</div>		
			
			<div class="slider_block">
				<label for="segments_rate_slider">Segments:</label>
				<input bind:value={settings.segments} onpointerdown={()=>dragging=true} onpointerup={()=>dragging=false} onchange={()=>CommitSettingChange('segments')} type="range" min="1" max="16" step="1" id="segments_rate_slider" />
				<output>{(settings.segments||0).toFixed()}</output>
			</div>		
		{/if}		
	{/if}
			
</section>