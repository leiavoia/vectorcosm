<script>
	import * as SVGUtils from '../util/svg.js'
	
	let {camera} = $props();
	
	let layers = $state([
		{name: 'bg', label: 'Background', geo:camera.renderLayers['bg'], visible:camera.renderLayers['bg'].visible, opacity: camera.renderLayers['bg'].opacity },
		{name: 'boids', label: 'Boids', geo:camera.renderLayers['boids'], visible:camera.renderLayers['boids'].visible, opacity: camera.renderLayers['boids'].opacity },
		{name: 'foods', label: 'Food', geo:camera.renderLayers['foods'], visible:camera.renderLayers['foods'].visible, opacity: camera.renderLayers['foods'].opacity },
		{name: 'plants', label: 'Plants', geo:camera.renderLayers['plants'], visible:camera.renderLayers['plants'].visible, opacity: camera.renderLayers['plants'].opacity },
		{name: 'rocks', label: 'Rocks', geo:camera.renderLayers['rocks'], visible:camera.renderLayers['rocks'].visible, opacity: camera.renderLayers['rocks'].opacity },
		{name: 'marks', label: 'Marks', geo:camera.renderLayers['marks'], visible:camera.renderLayers['marks'].visible, opacity: camera.renderLayers['marks'].opacity },
		// {name: 'ui', label: 'UI', geo:camera.renderLayers['ui'], visible:camera.renderLayers['ui'].visible, opacity: camera.renderLayers['ui'].opacity },
	]);

	let settings = $state([
		{name: 'animate_boids', label: 'Animate Boids', on: !!camera.animate_boids, disabled:false},
		{name: 'animate_plants', label: 'Animate Plants', on: !!camera.animate_plants, disabled:false},
		{name: 'animate_marks', label: 'Animate Marks', on: !!camera.animate_marks, disabled:false},
		{name: 'animate_foods', label: 'Animate Food', on: !!camera.animate_foods, disabled:false},
		{name: 'allow_hyperzoom', label: 'Allow Hyperzoom', on: !!camera.allow_hyperzoom, disabled:false},
		{name: 'transitions', label: 'Cinema Transitions', on: !!camera.transitions, disabled:false},
		{name: 'parallax', label: 'Parallax', on: !!camera.parallax, disabled:true},
		{name: 'show_boid_indicator_on_focus', label: 'Focus Ring', on: !!camera.show_boid_indicator_on_focus, disabled:false},
		{name: 'show_boid_info_on_focus', label: 'Boid Info', on: !!camera.show_boid_info_on_focus, disabled:false},
		{name: 'show_boid_sensors_on_focus', label: 'Boid Sensors', on: !!camera.show_boid_sensors_on_focus, disabled:false},
		{name: 'center_camera_on_focus', label: 'Center on Focus', on: !!camera.center_camera_on_focus, disabled:false},
	]);
	
	function toggleLayer( layer ) {
		layer.visible = !layer.visible;
		layer.geo.visible = layer.visible;
	}
	
	function updateLayerOpacity( layer ) {
		layer.geo.opacity = layer.opacity;
	}
	
	$effect( () => {
		layers[0].geo.opacity = layers[0].opacity;
	} );
	
	$effect( () => {
		layers[4].geo.opacity = layers[4].opacity;
	} );
	
	$effect( () => {
		camera.focus_time = camera_focus_time;
	} );
	
	$effect( () => {
		camera.transition_time = camera_transition_time;
	} );
	
	// Note: these are not reactive in the Camera class, so UI wont update if 
	// camera is updated from outside this componant.
	let cinema_mode_active = $state(camera.cinema_mode);
	let camera_focus_time = $state(camera.focus_time);
	let camera_transition_time = $state(camera.transition_time);
	
	function MoveCameraOut() {
		const diff = Math.abs( camera.scale - (camera.scale * (1/(1 + 0.25))) );
		camera.MoveCamera( 0, 0, -diff );
	}
	function MoveCameraIn() {
		const diff = Math.abs( camera.scale - (camera.scale * ((1 + 0.25)/1)) );
		camera.MoveCamera( 0, 0, diff );
	}
	function ResetCamera() {
		camera.ResetCameraZoom();
	}
	function MoveCameraLeft() {
		camera.MoveCamera( -100, 0 );
	}
	function MoveCameraRight() {
		camera.MoveCamera( 100, 0 );
	}
	function MoveCameraUp() {
		camera.MoveCamera( 0, -100 );
	}
	function MoveCameraDown() {
		camera.MoveCamera( 0, 100 );
	}
	function CinemaMode() {
		camera.CinemaMode( !camera.cinema_mode );
		cinema_mode_active = camera.cinema_mode;
	}
	function ToggleHyperzoom() {
		camera.allow_hyperzoom = !camera.allow_hyperzoom;
		camera.MoveCamera(0,0,0); // triggers update if out of bounds
	}
	function ToggleSetting( row ) {
		row.on = !row.on;
		camera[row.name] = row.on;
	}
	
</script>

<style>
	BUTTON { 
		/* width: 100%;  */
		margin-bottom: 0.25rem; 
	}
	.button_rack {
		/* width:100%; */
		display:flex;
		flex-wrap: wrap; 
		/* align-items:stretch; */
		column-gap:0.25rem;
		margin-top: var(--pico-spacing);
		/* margin-bottom: var(--pico-spacing); */
	}
	.button_rack BUTTON {
		flex: 1 1 0;
	}	
	.button_rack.options BUTTON {
		min-width: 40%;
	}	
	.slider_block {
		margin-top: var(--pico-form-element-spacing-vertical);
	}
	.jumbo BUTTON {
		font-size:120%;
		font-weight: bold;
	}
</style>

<section>
	<header>
		<h3>Camera</h3>
	</header>
	<div class="button_rack jumbo">
		<button onclick={MoveCameraLeft}>⏴&#xFE0E;</button>
		<button onclick={MoveCameraRight}>⏵&#xFE0E;</button>
		<button onclick={MoveCameraUp}>⏶&#xFE0E;</button>
		<button onclick={MoveCameraDown}>⏷&#xFE0E;</button>
		<button onclick={MoveCameraIn}>+</button>
		<button onclick={MoveCameraOut}>-</button>
		<button onclick={ResetCamera}>▢&#xFE0E;</button>
		<button onclick={CinemaMode} class={{outline:!cinema_mode_active}}>⏩&#xFE0E;</button>
	</div>
</section>
	
<section>
	<header>
		<h3>Settings</h3>
	</header>
	
	<div class="button_rack options">
	{#each settings as setting}
		<button class={{outline:!setting.on}} onclick={()=>ToggleSetting(setting)} disabled={setting.disabled}>{setting.label}</button> 
	{/each}	
	</div>

	<div class="slider_block">
		<label for="focus_time_input" style="width:8em;">Focus Time:</label>
		<input id="focus_time_input" type="range" min="1000" max="120000" step="1" style="width:8em;" bind:value={camera_focus_time} />
		<output>{(camera_focus_time/1000).toFixed(0)}s</output>
	</div>
	
	<div class="slider_block">
		<label for="transition_time_input" style="width:8em;">Transition Time:</label>
		<input id="transition_time_input" type="range" min="1000" max="120000" step="1" style="width:8em;" bind:value={camera_transition_time} />
		<output>{(camera_transition_time/1000).toFixed(0)}s</output>
	</div>
			
</section>	

<section>
	<header>
		<h3>Layers</h3>
	</header>	
	
	<div class="slider_block">
		<label for="bg_opacity_input">BG Opacity:</label>
		<input id="bg_opacity_input" type="range" min="0" max="1" step="0.01" bind:value={layers[0].opacity} />
		<output>{(layers[0].opacity*100).toFixed(0)}%</output>
	</div>
	
	<div class="slider_block">
		<label for="rock_opacity_input">Rock Opacity:</label>
		<input id="rock_opacity_input" type="range" min="0" max="1" step="0.01" bind:value={layers[4].opacity} />
		<output>{(layers[4].opacity*100).toFixed(0)}%</output>
	</div>
	
	<div class="button_rack options">
	{#each layers as layer}
		<button onclick={()=>toggleLayer(layer)} class={{outline:!layer.visible}}>{layer.label}</button>
	{/each}
	</div>
	
	<div class="button_rack">
		<button onclick={SVGUtils.ExportSceneToSVG}>Export Scene To SVG</button>
	</div>
		
</section>