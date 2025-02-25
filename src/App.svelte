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

	// set up game loop and lifecycle hooks
	let gameloop = new GameLoop();
	
	// camera needs tank and window data before it can be set up
	let camera = null;

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
		if ( camera && camera.focus_obj_id > 0 ) {
			api.SendMessage('pickObject', {oid:camera.focus_obj_id}); // send back for another round
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
	let simSettings = $state.raw({});
	
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
							// renderLayers['fg'].add(renderLayers['bg']);
							// tank frame is a fixed size
							geo = globalThis.two.makeRectangle(o.geodata.width/2, o.geodata.height/2, o.geodata.width, o.geodata.height );
							geo.stroke = "#888888";
							geo.linewidth = '2';
							geo.fill = 'transparent';	
							// set up a camera
							if ( !camera ) {
								camera = new Camera( renderLayers['fg'], renderLayers['bg'], renderObjects );
								camera.window_width = two.width;
								camera.window_height = two.height;
							}
							camera.tank_width = o.geodata.width;
							camera.tank_height = o.geodata.height;
							camera.ResetCameraZoom();
						}
					}
					else if ( o.type=='food' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);
					}
					else if ( o.type=='plant' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);
					}
					else if ( o.type=='mark' ) {
						geo = SVGUtils.RehydrateGeoData(o.geodata);		
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
					}
					// add new geometry to scene
					if ( geo ) {
						SVGUtils.UpdateBasicGeoProps( geo, o );
						o.geo = geo;
						renderLayers['fg'].add(geo);
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
		if ( Object.keys(simSettings).length === 0 && simStats.settings ) { // don't do this every frame
			simSettings = simStats.settings;
		} 
		gameloop.EndSimFrame();
	});
		
	api.RegisterResponseCallback( 'pickObject', data => {
		const focus_object_id = data ? data.oid : 0;
		// capture any sensor geometry so we can use it later
		if ( data && data?.sensor_geo ) {
			const obj = renderObjects.get(focus_object_id);
			if ( obj && 'geodata' in obj && !('sensors' in obj.geodata) ) {
				obj.geodata.sensors = data.sensor_geo;
			}
		}
		// track objects and update UI
		camera.TrackObject(focus_object_id);
		if ( focus_object_panel ) {
			focus_object_panel.updateStats(data); // null will make it go away
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
		// console.log(data);
		// if ( !focus_object_panel ) { return; }
		// focus_object_panel.updateStats(data); 
	} );
	
	api.RegisterResponseCallback( 'simNew', data => {
		// console.log(data);
		// if ( !focus_object_panel ) { return; }
		// focus_object_panel.updateStats(data); 
		// camera.tank_width = o.geodata.width;
		// camera.tank_height = o.geodata.height;
		camera.ResetCameraZoom();	
		simChartData.averages.length = 0;
		simChartData.highscores.length = 0;
		simChartData.labels.length = 0;
	} );
	
	// gameloop starts when drawing context is fully mounted (see component)
	function onDrawingReady() {
		// create rendering layers before drawing objects start to arrive from simulation
		renderLayers['bg'] = globalThis.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		renderLayers['fg'] = globalThis.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		// initialize the sim
		const params = {
			width:globalThis.two.width * 2,
			height:globalThis.two.height * 2
		};
		api.SendMessage('init',params);
		gameloop.Start();
		// this.renderLayers['backdrop'] = this.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		// this.foreground_layer = this.two.makeGroup(); // meta group. UI and tank layers need to scale separately
		// this.renderLayers['-2'] = this.two.makeGroup(); // tank backdrop
		// this.renderLayers['-1'] = this.two.makeGroup(); // background objects
		// this.renderLayers['0'] = this.two.makeGroup(); // middle for most objects / default
		// this.renderLayers['1'] = this.two.makeGroup(); // foregrounds objects
		// this.renderLayers['2'] = this.two.makeGroup(); // very near objects
		// this.renderLayers['ui'] = this.two.makeGroup(); // UI layer - stays separate from the others
		// this.foreground_layer.add(this.renderLayers['-2']);
		// this.foreground_layer.add(this.renderLayers['-1']);
		// this.foreground_layer.add(this.renderLayers['0']);
		// this.foreground_layer.add(this.renderLayers['1']);
		// this.foreground_layer.add(this.renderLayers['2']);				
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
		// 'PageUp': _ => {
		// 		vc.ShiftFocusTarget();
		// 		if ( show_boid_details.value ) {
		// 			RefreshBoidDetailsDynamicObjects( vc.focus_object );
		// 		}			
		// 	},
		// 'PageDown': _ => {
		// 		vc.ShiftFocusTarget(-1);
		// 		if ( show_boid_details.value ) {
		// 			RefreshBoidDetailsDynamicObjects( vc.focus_object );
		// 		}			
		// 	},
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
				// stop any pending picking update
				if ( camera.cinema_mode ) { api.expect.pickObject = false; }
				camera.CinemaMode( !camera.cinema_mode );
			},
		// '8': _ => {
		// 		vc.animate_boids = !vc.animate_boids;
		// 	},
		// '6': _ => {
		// 		vc.tank.bg_visible = !vc.tank.bg_visible;
		// 		vc.tank.bg.visible = vc.tank.bg_visible;
		// 	},
		// '7': _ => {
		// 		ToggleTankDebug();
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
			<CameraSettingsPanel></CameraSettingsPanel>
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