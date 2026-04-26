<script>
	import * as SVGUtils from '../util/svg.js'
	
	let {camera} = $props();
	
	// Layer descriptors: geo reference + local UI state (visible/opacity) mirror Two.js group props,
	// which are not reactive. Local state is the source of truth for UI; we push to geo imperatively.
	let layers = $state([
		{name: 'bg', label: 'Background', geo:camera.renderLayers['bg'], visible:camera.renderLayers['bg'].visible, opacity: camera.renderLayers['bg'].opacity },
		{name: 'boids', label: 'Boids', geo:camera.renderLayers['boids'], visible:camera.renderLayers['boids'].visible, opacity: camera.renderLayers['boids'].opacity },
		{name: 'foods', label: 'Food', geo:camera.renderLayers['foods'], visible:camera.renderLayers['foods'].visible, opacity: camera.renderLayers['foods'].opacity },
		{name: 'plants', label: 'Plants', geo:camera.renderLayers['plants'], visible:camera.renderLayers['plants'].visible, opacity: camera.renderLayers['plants'].opacity },
		{name: 'rocks', label: 'Rocks', geo:camera.renderLayers['rocks'], visible:camera.renderLayers['rocks'].visible, opacity: camera.renderLayers['rocks'].opacity },
		{name: 'marks', label: 'Marks', geo:camera.renderLayers['marks'], visible:camera.renderLayers['marks'].visible, opacity: camera.renderLayers['marks'].opacity },
		// {name: 'ui', label: 'UI', geo:camera.renderLayers['ui'], visible:camera.renderLayers['ui'].visible, opacity: camera.renderLayers['ui'].opacity },
	]);

	// Setting descriptors: camera properties are now $state on Camera directly — no local mirror needed.
	// Buttons read camera[name] and toggle via camera[name] = !camera[name].
	const settings = [
		{name: 'animate_boids', label: 'Animate Boids', disabled:false},
		{name: 'animate_plants', label: 'Animate Plants', disabled:false},
		{name: 'animate_marks', label: 'Animate Marks', disabled:false},
		{name: 'animate_foods', label: 'Animate Food', disabled:false},
		{name: 'allow_hyperzoom', label: 'Allow Hyperzoom', disabled:false},
		{name: 'transitions', label: 'Cinema Transitions', disabled:false},
		{name: 'parallax', label: 'Parallax', disabled:true},
		{name: 'show_boid_indicator_on_focus', label: 'Focus Ring', disabled:false},
		{name: 'show_boid_info_on_focus', label: 'Boid Info', disabled:false},
		{name: 'show_boid_sensors_on_focus', label: 'Boid Sensors', disabled:false},
		{name: 'center_camera_on_focus', label: 'Center on Focus', disabled:false},
	];
	
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
	
	// focus_time and transition_time are now $state on Camera — bind directly, no effect needed.
	// cinema_mode is $state on Camera — read camera.cinema_mode directly in template.

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
	}
	function ToggleHyperzoom() {
		camera.allow_hyperzoom = !camera.allow_hyperzoom;
		camera.MoveCamera(0,0,0); // triggers update if out of bounds
	}
	function ToggleSetting( row ) {
		camera[row.name] = !camera[row.name];
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
		<button onclick={CinemaMode} class={{outline:!camera.cinema_mode}}>⏩&#xFE0E;</button>
	</div>
</section>
	
<section>
	<header>
		<h3>Settings</h3>
	</header>
	
	<div class="button_rack options">
	{#each settings as setting}
		<button class={{outline:!camera[setting.name]}} onclick={()=>ToggleSetting(setting)} disabled={setting.disabled}>{setting.label}</button> 
	{/each}	
	</div>

	<div class="slider_block">
		<label for="focus_time_input" style="width:8em;">Focus Time:</label>
		<input id="focus_time_input" type="range" min="1000" max="120000" step="1" style="width:8em;" bind:value={camera.focus_time} />
		<output>{(camera.focus_time/1000).toFixed(0)}s</output>
	</div>
	
	<div class="slider_block">
		<label for="transition_time_input" style="width:8em;">Transition Time:</label>
		<input id="transition_time_input" type="range" min="1000" max="120000" step="1" style="width:8em;" bind:value={camera.transition_time} />
		<output>{(camera.transition_time/1000).toFixed(0)}s</output>
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