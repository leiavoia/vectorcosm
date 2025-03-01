<script>

	import FocusObjectDetails from './ui/FocusObjectDetails.svelte';
	import TankStatsPanel from './ui/TankStatsPanel.svelte';
	import SimStatsPanel from './ui/SimStatsPanel.svelte';
	import SimulatorControlsPanel from './ui/SimulatorControlsPanel.svelte';
	import SimulationLauncherPanel from './ui/SimulationLauncherPanel.svelte';
	import BoidLibraryPanel from './ui/BoidLibraryPanel.svelte';
	import CameraSettingsPanel from './ui/CameraSettingsPanel.svelte';
	import VectorcosmDrawingContext from './ui/VectorcosmDrawingContext.svelte';
	import GameLoop from './classes/class.GameLoop.js'
	import VectorcosmAPI from './classes/class.VectorcosmAPI.js'
	import Camera from './classes/class.Camera.js'
	import Two from "two.js";
	import * as SVGUtils from './util/svg.js'
	import { setContext } from 'svelte';
	
	let vc_canvas;
	let focus_object_panel;
	let simStatsPanel;
	
	let panel_mode = $state(null);
	
	let renderLayers = {};
			
	function setPanelMode( mode ) {
		panel_mode = panel_mode == mode ? null : mode;
	}

	// vectorcosm simulation runs in a worker thread
	const worker = new Worker(
		new URL('./workers/vectorcosm.worker.js', import.meta.url),
		// options
		{ type: 'module' }
	);
	
	// use the API to send and receive messages to Vectorcosm
	const api = new VectorcosmAPI( worker );
	setContext('api', api);

	// set up game loop and lifecycle hooks
	let gameloop = new GameLoop();
	setContext('gameloop', gameloop);
	
	// camera needs tank and window data before it can be set up
	let camera = $state(null);
	setContext('camera', camera);

	gameloop.onStartFrame = () => {
		// update all your stats here
	}

	gameloop.onStartSim = delta => {
		const data = {
			f:'update',
			num_frames: gameloop.updates_per_frame, // variable turbo
			delta: ( gameloop.updates_per_frame > 1 ? gameloop.max_delta : delta )
		};
		worker.postMessage( data );
		// update or cancel object tracking
		if ( camera ) {
			if ( camera.focus_obj_id > 0 ) {
				api.SendMessage('pickObject', {oid:camera.focus_obj_id}); // send back for another round
			}
			else if ( focus_object_panel ) {
				focus_object_panel.updateStats(null); // null will make it go away
			}
		}
	}

	gameloop.onStartDrawing = () => {
		if ( camera ) { camera.Render(); }
	}
	
	// create a map of all drawable objects. these are coming from the vectorcosm worker.
	// this map contains the necessary info to draw and animate the objects.
	// they are keyed by an object_id (oid) supplied by vectorcosm. 
	let renderObjects = new Map();
	
	// tank stats we track each frame
	let tankStats = $state.raw({});
	let simStats = $state.raw({});
	let simSettings = $state({});
	
	// for each type of message we want to send, set up a callback to handle the response
	api.RegisterResponseCallback( 'update', data => {
		if ( globalThis.two ) {
			// keep track of what there is so we can remove what there aint
			const found = new WeakSet();
			for ( let o of data.renderObjects ) {
				// if new geodata is supplied, treat as a new object
				if ( o?.geodata && renderObjects.has(o.oid) ) {
					const obj = renderObjects.get(o.oid);
					if ( 'geo' in obj ) {
						obj.geo.remove();
						renderObjects.delete(o.oid);
					}
				}
				// existing objects
				if ( renderObjects.has(o.oid) ) {
					// update reference data
					const obj = renderObjects.get(o.oid);
					for ( let k in o ) {
						if ( k =='geodata' ) { continue; }
						obj[k] = o[k];
					}
					found.add(obj);
					// update basic svg properties without recreating the entire shape
					if ( 'geo' in obj ) { SVGUtils.UpdateBasicGeoProps( obj.geo, o ); }
				}			
				// new objects
				else {
					let geo = null;
					if ( o.type=='boid' ) {
						if ( o.geodata ) { 
							geo = SVGUtils.RehydrateGeoData(o.geodata);
						}						
						else {
							geo = globalThis.two.makePath([
								new Two.Anchor( -12, -6 ),
								new Two.Anchor( 12, 0 ),
								new Two.Anchor( -12, 6 ),
							]);
							geo.fill = '#33FFFF';
							geo.stroke = 'transparent';
							geo.linewidth = 0;
						}
						renderLayers['boids'].add(geo);
					}
					else if ( o.type=='obstacle' ) {
						// Note: Two.js positions things in the middle of the bounding box.
						// In order to dodge this bit of weirdness, you need to create a group
						// and stuff rock contents inside the group. This helps for triangle representation anyway.
						geo = globalThis.two.makeGroup();
						if ( o.geodata.triangles ) {
							for ( let t of o.geodata.triangles ) {
								let p = globalThis.two.makePath( ...t.slice(null, -1) );
								p.linewidth = 1;
								p.fill = t[6];
								p.stroke = t[6];
								geo.add(p);
							}
						}
						else if ( o.geodata.hull ) {
							let path = globalThis.two.makePath( o.geodata.hull.map( p => new Two.Anchor(p[0],p[1]) ) );
							path.fill = '#999';
							path.stroke = 'transparent';
							path.linewidth = 0;
							geo.add(path);
						}
						renderLayers['rocks'].add(geo);
					}
					else if ( o.type=='tank' ) {
						if ( o.geodata ) {
							// the theme is an HTML element classname and not part of the drawing context
							if ( o.geodata.bg_theme_class && vc_canvas ) {
								vc_canvas.SetTheme(o.geodata.bg_theme_class);
							}
							
							// background triangles get their own layer so we can scale it independently
							renderLayers['bg'].children.forEach( c => c.remove() );
							renderLayers['bg'].opacity = o.geodata.bg_opacity || 1;
							for ( let t of o.geodata.triangles ) {
								let p = globalThis.two.makePath( ...t.slice(null, -1) );
								p.linewidth = 1;
								p.fill = t[6];
								p.stroke = t[6];
								renderLayers['bg'].add(p);
							}
							
							// for fixed backgrounds, add the background into the fg layer
							// renderLayers['tank'].add(renderLayers['bg']);
							
							// tank frame is a fixed size
							geo = globalThis.two.makeRectangle(o.geodata.width/2, o.geodata.height/2, o.geodata.width, o.geodata.height );
							geo.stroke = "#888888";
							geo.linewidth = '2';
							geo.fill = 'transparent';	
							renderLayers['ui'].add(geo);
							// set up a camera
							if ( !camera ) {
								camera = new Camera( renderLayers, renderObjects );
								camera.window_width = two.width;
								camera.window_height = two.height;
							}
							camera.tank_width = o.geodata.width;
							camera.tank_height = o.geodata.height;
							camera.ResetCameraZoom();
							camera.DramaticEntrance();
						}
					}
					else if ( o.type=='food' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);
						renderLayers['foods'].add(geo);
					}
					else if ( o.type=='plant' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);
						renderLayers['plants'].add(geo);
					}
					else if ( o.type=='mark' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);
						renderLayers['marks'].add(geo);		
					}
					else { // unknown object
						geo = SVGUtils.RehydrateGeoData({
							type:'rect',
							w: 10,
							h: 10,
							fill: '#BBBBBB',
							stroke: 'transparent',
							linewidth: 0,
						});
						renderLayers['boids'].add(geo);		
					}
					// add new geometry to scene
					if ( geo ) {
						SVGUtils.UpdateBasicGeoProps( geo, o );
						o.geo = geo;
					}
					renderObjects.set(o.oid, o);
					found.add(o);
				}
			}
			// remove all objects not found
			for ( let [oid,obj] of renderObjects ) {
				if ( !found.has(obj) ) {
					if ( 'geo' in obj ) { obj.geo.remove(); }
					renderObjects.delete(oid);
				}
			}
		}
		// record and update stats
		tankStats = data.tankStats;
		simStats = data.simStats;
		simStats.fps = gameloop.fps_avg.toFixed(0);
		gameloop.EndSimFrame();
	});
		
	// NOTE: this is called every frame while an object is in focus.
	// It is possible for the callback to respond after user has deselected a focus object,
	// causing it to re-focus. To detect this situation, take of presence of sensor_geo
	// which is only sent on the first frame and can be used to understand if this is the
	// first frame or a repeat request
	api.RegisterResponseCallback( 'pickObject', data => {
		const focus_object_id = data ? data.oid : 0;
		// capture any sensor geometry so we can use it later
		if ( data && data?.sensor_geo ) {
			const obj = renderObjects.get(focus_object_id);
			if ( obj && 'geodata' in obj && !('sensors' in obj.geodata) ) {
				obj.geodata.sensors = data.sensor_geo;
			}
		}
		// likely a repeat request that came back too late - disregard
		else if ( camera.focus_obj_id <= 0 ) {
			if ( focus_object_panel ) {
				focus_object_panel.updateStats(null); // null will make it go away
			}
			return;
		}
		// track objects and update UI
		camera.TrackObject(focus_object_id);
		if ( focus_object_panel ) {
			if ( !data || camera.show_boid_info_on_focus ) { // respect camera settings even though its not actually camera related
				focus_object_panel.updateStats(data);
			}
		}
	} );
	
	let simChartData = $state.raw({
		averages:[],
		highscores:[],
		labels:[]
	});
		
	api.RegisterResponseCallback( 'simRound', data => {
		simChartData.averages.push( data.round_avg_score );
		simChartData.highscores.push( data.round_best_score );
		simChartData.labels.push( data.round_num );
		if ( simStatsPanel ) {
			simStatsPanel.onRoundComplete();
		}
	} );
	
	api.RegisterResponseCallback( 'simComplete', data => {
	
	} );
	
	api.RegisterResponseCallback( 'simNew', data => {
		camera.ResetCameraZoom();	
		simChartData.averages.length = 0;
		simChartData.highscores.length = 0;
		simChartData.labels.length = 0;
		// new sim, new settings
		if ( data ) {
			simSettings = data;
		} 		
	} );
	
	api.RegisterResponseCallback( 'exportTank', str => {
		globalThis.localStorage.setItem("tank", str);
	} );
	
	// gameloop starts when drawing context is fully mounted (see component)
	function onDrawingReady() {
		// create rendering layers before drawing objects start to arrive from simulation
		renderLayers['bg'] = globalThis.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		renderLayers['tank'] = globalThis.two.makeGroup(); // foreground layer moves as a single unit for pan/zoom
		renderLayers['plants'] = globalThis.two.makeGroup();  renderLayers['tank'].add(renderLayers['plants']);
		renderLayers['rocks'] = globalThis.two.makeGroup(); renderLayers['tank'].add(renderLayers['rocks']);
		renderLayers['boids'] = globalThis.two.makeGroup(); renderLayers['tank'].add(renderLayers['boids']);
		renderLayers['foods'] = globalThis.two.makeGroup(); renderLayers['tank'].add(renderLayers['foods']);
		renderLayers['marks'] = globalThis.two.makeGroup(); renderLayers['tank'].add(renderLayers['marks']);
		renderLayers['ui'] = globalThis.two.makeGroup(); renderLayers['tank'].add(renderLayers['ui']);
		
		// initialize the sim
		const params = {
			width:globalThis.two.width * 2,
			height:globalThis.two.height * 2
		};
		api.SendMessage('init',params);
		gameloop.Start();		
	}
	
	function toggleFastForward() {
		gameloop.updates_per_frame = gameloop.updates_per_frame > 1 ? 1 : 200;
	}

	const keyFunctionMap = {
		'Pause': _ => {
			gameloop.playing = !gameloop.playing;
			if ( gameloop.playing ) { gameloop.Start(); }
		},
		'p': _ => {
			gameloop.playing = !gameloop.playing;
			if ( gameloop.playing ) { gameloop.Start(); }
		},
		'_': _ => {
			const diff = Math.abs( camera.scale - (camera.scale * (1/(1 + camera.z))) );
			camera.MoveCamera( 0, 0, -diff );
		},
		'-': _ => {
			const diff = Math.abs( camera.scale - (camera.scale * (1/(1 + camera.z))) );
			camera.MoveCamera( 0, 0, -diff );
		},
		'=': _ => {
			const diff = Math.abs( camera.scale - (camera.scale * ((1 + camera.z)/1)) );
			camera.MoveCamera( 0, 0, diff );
		},
		'+': _ => {
			const diff = Math.abs( camera.scale - (camera.scale * ((1 + camera.z)/1)) );
			camera.MoveCamera( 0, 0, diff );
		},
		';': _ => {
			camera.ResetCameraZoom();
		},
		// '\'': _ => {
		// 		vc.ResizeTankToWindow(true);
		// 		vc.ResetCameraZoom();
		// 	},
		'Home': _ => {
			camera.ResetCameraZoom();
		},
		'ArrowLeft': _ => {
			camera.MoveCamera( -100, 0 );
		},
		'ArrowRight': _ => {
			camera.MoveCamera( 100, 0 );
		},
		'ArrowUp': _ => {
			camera.MoveCamera( 0, -100 );
		},
		'ArrowDown': _ => {
			camera.MoveCamera( 0, 100 );
		},
		'PageUp': _ => {
			let list = Array.from(renderObjects.values()).filter(o=>o.type=='boid');
			let i = -1;
			if ( camera.focus_obj_id > 0 ) { 
				i = list.indexOf( renderObjects.get(camera.focus_obj_id) ) ?? -1;
			}
			i = (i+1 == list.length) ? 0 : i+1;
			camera.TrackObject( list[i].oid );
		},
		'PageDown': _ => {
			let list = Array.from(renderObjects.values()).filter(o=>o.type=='boid');
			let i = list.length;
			if ( camera.focus_obj_id > 0 ) { 
				i = list.indexOf( renderObjects.get(camera.focus_obj_id) ) ?? -1;
			}
			i = (i-1 < 0) ? (list.length-1) : i-1;
			camera.TrackObject( list[i].oid );		
		},
		// 's': _ => {
		// 		vc.SaveTank();
		// 	},
		// 'a': _ => {
		// 		vc.LoadTank();
		// 	},
		'1': _ => {
			setPanelMode('tank_stats')
		},
		'2': _ => {
			setPanelMode('sim_controls')
		},
		'3': _ => {
			setPanelMode('settings')
		},
		'4': _ => {
			setPanelMode('boid_library')
		},
		'5': _ => {
			setPanelMode('sim_launcher')
		},
		'Escape': _ => {
			// if ( show_boid_details.value ) { show_boid_details.value = false; }
			if ( camera.focus_obj_id > 0 ) { 
				api.expect.pickObject = false; // stop any pending picking update
				camera.TrackObject(false);
				focus_object_panel.updateStats(null);
			}
			else { setPanelMode(null); }
		},
		'End': _ => {
			toggleFastForward();
		},
		'c': _ => {
			camera.CinemaMode( !camera.cinema_mode );
		},
		// '8': _ => {
		// 		vc.animate_boids = !vc.animate_boids;
		// 	},
		// '6': _ => {
		// 		vc.tank.bg_visible = !vc.tank.bg_visible;
		// 		vc.tank.bg.visible = vc.tank.bg_visible;
		// 	},
		// 'b': _ => {
		// 		vc.ToggleShowBrainmap()
		// 	},
		// 'r': _ => {
		// 		vc.responsive_tank_size = !vc.responsive_tank_size;
		// 	},
		// '9': _ => {
		// 		vc.SavePopulation();
		// 	},
		// '0': _ => {
		// 		vc.LoadPopulation();
		// 	},
	}

	function onkeydown(event) {
		if ( event.key in keyFunctionMap ) {
			event.preventDefault();
			keyFunctionMap[event.key]();
		}
	};
	
	let windowResizeTimeout = null;
	function onresize (event) {
		// there is no "windowResizeFinished" event, so settle for timeout to avoid jank
		if ( windowResizeTimeout ) { clearTimeout(windowResizeTimeout); }
		windowResizeTimeout = setTimeout(function() {
			camera.height = window.innerHeight;
			camera.width = window.innerWidth;
			globalThis.two.fit();
			camera.ResetCameraZoom(); // also does parallax
		}, 200);
	}
	
	// mouse event handling state variables
	const min_drag = 6;
	let drag_start_x = 0;
	let drag_start_y = 0;
	let dragging = false;
	let dragged = false; // detects if movement was made during mouse down
	let idle_for = 0;
	let is_idle = $state(false);
	
	function onwheel(event) {
		camera.ZoomAt( event.clientX, event.clientY, event.deltaY > 0 );
	}
	
	function onclick (event) {
		if ( !camera ) { return false; }
		// do nothing if we just finished moving map or dragging cursor
		if ( dragged ) { 
			dragged = false;
			return false; 
		}
		const [x,y] = camera.ScreenToWorldCoord(event.clientX, event.clientY);
		// recenter the map on right-click or wheel click
		if ( event.button >= 2 ) { 
			camera.PointCameraAt( x, y );
			return false;
		}
		// pick object on left click
		else {
			const params = {
				x: x, 
				y: y,
				radius: Math.min( 60, 60 / camera.scale ), // pixels in world space
				inc_sensor_geo:true // get boid sensor visualization on first request only
			};
			camera.TrackObject(false); // unselect currently selected object
			api.SendMessage('pickObject', params);
		}
	}
	
	function onmousedown(event) {
		if ( event.button > 1 ) { return true; }
		dragging = true;
		drag_start_x = event.clientX;
		drag_start_y = event.clientY;
		idle_for = 0;
		is_idle = false;
		dragged = false;
	}
	
	function onmouseup(event) {
		if ( event.button > 1 ) { return true; }
		dragging = false;
		idle_for = 0;
		is_idle = false;
	}
	
	function onmousemove(event) {
		if ( dragging && camera.focus_obj_id <= 0 ) {
			// camera pan - don't move the camera on fudge clicks
			const dx = event.clientX - drag_start_x;
			const dy = event.clientY - drag_start_y;
			if ( Math.sqrt( dx*dx + dy*dy ) >= min_drag ) { 
				camera.MoveCamera( -event.movementX, -event.movementY );
				dragged = true;
			}
		}
		idle_for = 0;
		is_idle = false;
	}
	
	function oncontextmenu(event) { // "right click"
		event.preventDefault();
		return onclick(event);
	}
	
	function UpdateIdleTime() {
		idle_for += 0.5;
		is_idle = idle_for >= 2 && !panel_mode;
		setTimeout( UpdateIdleTime, 500 );
	};
	
	function onSimulatorControlsUpdate(params) {
		api.SendMessage('updateSimSettings',params);
		// we also need to update the local settings
		for ( let k in params ) {
			simSettings[k] = params[k];
		}		
	}
	
	UpdateIdleTime(); // start immediately
	
</script>

<style>
	div.nav {
		max-width: 20rem; 
		/* flex: 1 1 auto;  */
		/* order: 2;  */
		/* height: 4rem;  */
		text-align:left; 
		padding: 0; 
		font-size:2rem; 
		margin-top:0;
		/* background: #0005;  */
		/* backdrop-filter: blur(2px); */
		transition: opacity filter 0.5s ease-in-out;
		filter: none;
		opacity: 1;
	}
	div.nav.is_idle {
		opacity: 0;
		filter: blur(2rem);
	}
	/* this override's pico's default settings. reduced motion config comes from user's OS, not browser or CSS ! */
	@media (prefers-reduced-motion: reduce) {
		div.nav {
			transition-duration: 0.5s !important;
		}
	}
	div.nav button {
		line-height:2rem; 
		height:2rem; 
		width:2rem; 
		opacity:0.25;
		background:none;
		font-size:inherit; 
		padding:0; 
		border:none;
	}
	div.nav button.selected {
		opacity:1;
	}
	main {
		/* width: 50%;  */
		flex: 100 1 auto; 
		padding: 1rem; 
		order: 1;	
		pointer-events:none;
	}
	aside {
		/* width: 50%;  */
		flex: 1 1 1; 
		padding: 1rem; 
		order: 2;	
		pointer-events:none;
	}
	#pagewrapper {
		display:relative; 
		display:flex; 
		flex-flow: row wrap; 
		pointer-events:none;
	}
	#pagewrapper main > *,
	#pagewrapper aside > * { pointer-events:auto; }
	.hidecursor { cursor: none; }
</style>

<svelte:window {onkeydown} {onresize} />

<div id="pagewrapper" data-theme="dark" class="{is_idle ? 'hidecursor' : ''}">
	<!-- 
		Vectorcosm two.js canvas area is fixed to the entire screen.
		all UI elements sit on top of it.
		this wrapper exists just to capture map-area events. 
		events originate from within the drawing divs and bubble out to here.
		this way we can keep the event handler logic up here.
	-->
	<div role="none" {onclick} {onwheel} {onmousedown} {onmouseup} {onmousemove} {oncontextmenu}>
		<VectorcosmDrawingContext bind:this={vc_canvas} on:drawingReady={onDrawingReady} ></VectorcosmDrawingContext>
	</div>
	
	<main>
		<!-- all your normal UI elements go in here -->
		<div class={['nav', {is_idle:is_idle}]}>
			<button onclick={_ => setPanelMode('tank_stats')} 	
				class:selected={panel_mode=='tank_stats'} 
				title="Tank Stats"
				aria-label="Tank Stats" 
				class="icon-chart-bar"></button>	&nbsp;
			<button onclick={_ => setPanelMode('sim_controls')}	
				class:selected={panel_mode=='sim_controls'} 
				title="Simulation Controls"
				aria-label="Simulation Controls" 
				class="icon-sliders"></button>	&nbsp;
			<button onclick={_ => setPanelMode('settings')} 	
				class:selected={panel_mode=='settings'} 
				title="Settings"
				aria-label="Settings"
				class="icon-camera"></button>	&nbsp;
			<button onclick={_ => setPanelMode('boid_library')}	
				class:selected={panel_mode=='boid_library'} 
				title="Creature Library"
				aria-label="Creature Library" 
				class="icon-database"></button>	&nbsp;
			<button onclick={_ => setPanelMode('sim_launcher')}	
				class:selected={panel_mode=='sim_launcher'} 
				title="Simulation Launcher"
				aria-label="Simulation Launcher" 
				class="icon-cogs"></button>
		</div>
		
		{#if panel_mode==='sim_controls'}
			<SimulatorControlsPanel settings={simSettings} onupdate={params=>onSimulatorControlsUpdate(params)}></SimulatorControlsPanel>
			<SimStatsPanel bind:this={simStatsPanel} stats={simStats} chartdata={simChartData}></SimStatsPanel>
		{:else if panel_mode==='tank_stats'}
			<TankStatsPanel stats={tankStats}></TankStatsPanel>
			<SimStatsPanel bind:this={simStatsPanel} stats={simStats} chartdata={simChartData}></SimStatsPanel>
		{:else if panel_mode==='settings'}
			<CameraSettingsPanel camera={camera}></CameraSettingsPanel>
		{:else if panel_mode==='boid_library'}
			<BoidLibraryPanel {api} ></BoidLibraryPanel>
		{:else if panel_mode==='sim_launcher'}
			<SimulationLauncherPanel {api} ></SimulationLauncherPanel>
		{/if}
		
	</main>
	
	<aside>
		<FocusObjectDetails bind:this={focus_object_panel}></FocusObjectDetails>
	</aside>
</div>



<!-- // Camera Class:
class Camera {
	constructor() {
		this.zoom = 1.0;
		// ... etc ...
	}	
}

// Svelte App:
<script>
	import Camera from './Camera.js'
	import CameraControls from './CameraControls.js'
	let camera = new Camera();
</script>
<CameraControls {camera}></CameraControls>

// Camera Settings Control Panel
<script>
	let {camera} = $props();
</script>
<input type="range" min="1" max="10" step="0.1" bind:value={camera.zoom} /> -->
