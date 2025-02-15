<script>

	import FocusObjectDetails from './ui/FocusObjectDetails.svelte';
	import TankStatsPanel from './ui/TankStatsPanel.svelte';
	import SimulatorControlsPanel from './ui/SimulatorControlsPanel.svelte';
	import SimulationLauncherPanel from './ui/SimulationLauncherPanel.svelte';
	import BoidLibraryPanel from './ui/BoidLibraryPanel.svelte';
	import CameraSettingsPanel from './ui/CameraSettingsPanel.svelte';
	import VectorcosmDrawingContext from './ui/VectorcosmDrawingContext.svelte';
	import GameLoop from './classes/class.GameLoop.js'
	import VectorcosmAPI from './classes/class.VectorcosmAPI.js'
	import Camera from './classes/class.Camera.js'
	import Two from "two.js";
	
	let focus_object_id = 0;
		
	let vc_canvas;
	let tank_stats_compo;
	let focus_object_panel;
	
	let panel_mode = null;
	
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
		if ( focus_object_id ) {
			api.SendMessage('pickObject', {oid:focus_object_id}); // send back for another round
		}
	}

	gameloop.onStartDrawing = () => {
		// see about addressing the component directly
		if ( globalThis.two ) { 
			globalThis.two.update(); 
		}
	}
	
	// create a map of all drawable objects. these are coming from the vectorcosm worker.
	// this map contains the necessary info to draw and animate the objects.
	// they are keyed by an object_id (oid) supplied by vectorcosm. 
	let renderObjects = new Map();
	
	// for each type of message we want to send, set up a callback to handle the response
	api.RegisterResponseCallback( 'update', data => {
		if ( globalThis.two ) {
			if ( vc_canvas ) {
				// vc_canvas.injestEvent('pie!');
			}
			// keep track of what there is so we can remove what there aint
			const found = new WeakSet();
			for ( let o of data.renderObjects ) {
				// new objects
				if ( !renderObjects.has(o.oid) ) {
					let geo = null;
					if ( o.type=='boid' ) {
						if ( o.geodata ) { 
							geo = RehydrateGeoData(o.geodata);
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
						if ( o.geodata ) {
							for ( let t of o.geodata.triangles ) {
								let p = globalThis.two.makePath( ...t.slice(null, -1) );
								p.linewidth = 1;
								p.fill = t[6];
								p.stroke = t[6];
								geo.add(p);
							}
						}
						else {
							let path = globalThis.two.makePath( o.pts.map( p => new Two.Anchor(p[0],p[1]) ) );
							path.fill = '#999';
							path.stroke = 'transparent';
							path.linewidth = 0;
							geo.add(path);
						}
					}
					else if ( o.type=='tank' ) {
						if ( o.geodata ) {
							// the theme is an HTML element classname and not part of the drawing context
							if ( o.geodata.bg_theme_class ) {
								vc_canvas.SetTheme(o.geodata.bg_theme_class);
							}
							// background triangles get their own layer so we can scale it independently
							renderLayers['bg'].opacity = o.geodata.bg_opacity || 1;
							for ( let t of o.geodata.triangles ) {
								let p = globalThis.two.makePath( ...t.slice(null, -1) );
								p.linewidth = 1;
								p.fill = t[6];
								p.stroke = t[6];
								renderLayers['bg'].add(p);
							}
							// for fixed backgrounds, add the background into the fg layer
							renderLayers['fg'].add(renderLayers['bg']);
							// tank frame is a fixed size
							let tankframe = globalThis.two.makeRectangle(o.geodata.width/2, o.geodata.height/2, o.geodata.width, o.geodata.height );
							tankframe.stroke = "#888888";
							tankframe.linewidth = '2';
							tankframe.fill = 'transparent';	
							renderLayers['fg'].add(tankframe);
							// set up a camera
							camera = new Camera( renderLayers['fg'], renderLayers['bg'] );
							camera.window_width = two.width;
							camera.window_height = two.height;
							camera.tank_width = o.geodata.width;
							camera.tank_height = o.geodata.height;
							// camera.PointCameraAt(0,0,0.25);
							camera.ResetCameraZoom();
						}
					}
					else if ( o.type=='food' ) {
						geo = RehydrateGeoData(o.geodata);
					}
					else if ( o.type=='plant' ) {
						geo = RehydrateGeoData(o.geodata);
						// geo = RehydrateGeoData({
						// 	type:'rect',
						// 	w: 100,
						// 	h: 100,
						// 	fill: 'transparent',
						// 	stroke: 'lime',
						// 	linewidth: 2,
						// 	rotation: Math.PI/4
						// });
					}
					else if ( o.type=='mark' ) {
						// geo = RehydrateGeoData(o.geodata);
						geo = RehydrateGeoData({
							type:'circle',
							r: 100,
							fill: 'transparent',
							stroke: 'magenta',
							linewidth: 1,
						});					
					}
					else {
						geo = RehydrateGeoData({
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
						o.geo = geo;
						renderLayers['fg'].add(geo);
					}
					renderObjects.set(o.oid, o);
					found.add(o);
				}
				// existing objects
				else {
					const obj = renderObjects.get(o.oid);
					for ( let k in o ) {
						obj[k] = o[k];
					}
					// update basic geometric properties without recreating the entire shape
					if ( 'geo' in obj ) { 
						if ( 'x' in o ) { obj.geo.position.x = o.x; }
						if ( 'y' in o ) { obj.geo.position.y = o.y; }
						if ( 'a' in o ) { obj.geo.rotation = o.a; }
						if ( 's' in o ) { obj.geo.scale = o.s; }
						if ( 'opacity' in o ) { obj.geo.opacity = o.opacity; }
					}
					found.add(obj);
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
		// stat tracking every 60 frames
		if ( gameloop.frame % 60 == 0 ) {
			api.SendMessage('getTankStats');
		}
		gameloop.EndSimFrame();
	});
	
	// we could add this directly to the component instead
	api.RegisterResponseCallback( 'getTankStats', data => {
		if ( tank_stats_compo ) {
			data.fps = gameloop.fps_avg.toFixed(0);
			tank_stats_compo.updateTankStats(data);
		}
	} );
	
	// we could add this directly to the component instead
	api.RegisterResponseCallback( 'pickObject', data => {
		if ( !focus_object_panel ) { return; }
		focus_object_id = data ? data.oid : 0;
		focus_object_panel.updateStats(data); // null will make it go away
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
	
	function RehydrateGeoData( data ) {
		if ( !data ) { return null; }
		const type = data?.type || 'group';
		// create the basic geometry
		let geo = null;
		switch ( type ) {
			case 'circle': {
				let x = data?.x || 0;
				let y = data?.y || 0;
				let r = data?.r || data?.radius || 1;
				geo = globalThis.two.makeCircle( x, y, r );
				break;
			}
			case 'polygon': {
				let x = data?.x || 0;
				let y = data?.y || 0;
				let r = data?.r || data?.radius || 1;
				let n = data?.n || data?.p || 3;
				geo = globalThis.two.makePolygon( x, y, r, n );
				break;
			}
			case 'rect': {
				let x = data?.x || 0;
				let y = data?.y || 0;
				let w = data?.w || 1;
				let h = data?.h || 1;
				geo = globalThis.two.makeRectangle( x, y, w, h );
				break;
			}
			case 'path': {
				let pts = data?.pts || data?.points || data?.path || [];
				let anchors = pts.map( p => new Two.Anchor( p[0], p[1] ) );
				geo = globalThis.two.makePath(anchors);
				break;
			}
			case 'line': {
				let x1 = data?.x1 || 0;
				let y1 = data?.y1 || 0;
				let x2 = data?.x2 || 0;
				let y2 = data?.y2 || 0;
				geo = globalThis.two.makeLine( x1, y1, x2, y2 );
				break;
			}
			case 'group':
			default: {
				geo = globalThis.two.makeGroup();
				break;
			}
		}
		// general properties
		if ( 'x' in data ) { geo.position.x = data.x; }
		if ( 'y' in data ) { geo.position.y = data.y; }
		if ( type != 'group' ) {
			geo.fill = RehydrateColor( data?.fill || 'transparent' );
			geo.stroke = RehydrateColor( data?.stroke || 'transparent' );
			geo.linewidth = data?.linewidth || 2;
			if ( 'a' in data ) { geo.rotation = data.a; }
			else if ( 'rotation' in data ) { geo.rotation = data.rotation; }
			if ( 's' in data ) { geo.scale = data.s; }
			else if ( 'scale' in data ) { geo.scale = data.scale; }
			if ( 'o' in data ) { geo.opacity = data.opacity; }
			else if ( 'opacity' in data ) { geo.opacity = data.opacity; }
			if ( 'curved' in data ) { geo.curved = data.curved; }
			if ( 'dashes' in data ) { geo.dashes = data.dashes; }
			if ( 'cap' in data ) { geo.cap = data.cap; }
			if ( 'closed' in data ) { geo.closed = data.closed; }
			if ( 'miter' in data ) { geo.miter = data.miter; }
		}
		// children 
		if ( data?.children ) {
			for ( let child of data.children ) { 
				child = RehydrateGeoData(child);
				geo.add(child); 
			}
		}
		return geo;
	}

	function RehydrateColor( c ) {
		if ( !c ) { return null; }
		// anything stringy goes right back out
		if ( typeof c === 'string' ) { return c; }
		// gradients have special syntax
		if ( typeof c === 'object' ) {
			let grad;
			let type = c?.type || 'linear';
			let stops = ( c?.stops || [1,'#FFF'] ).map( s => new Two.Stop(s[0], s[1]) );
			let xoff = c?.xoff || 0;
			let yoff = c?.yoff || 0;
			if ( type === 'radial' ) {
				let radius = c?.r || c?.radius || 1;
				grad = globalThis.two.makeRadialGradient(xoff, yoff, radius, ...stops );
			}
			else {
				let xoff2 = c?.xoff2 || 0;
				let yoff2 = c?.yoff2 || 0;
				grad = globalThis.two.makeLinearGradient(xoff, yoff, xoff2, yoff2, ...stops );
			}
			if ( c?.units==='user' || c?.units==='userSpaceOnUse' ) { grad.units = 'userSpaceOnUse'; }
			if ( 'spread' in c ) { grad.spread =c.spread; } // 'reflect', 'repeat', 'pad'
			return grad;			
		}
	}
	
	

	const keyFunctionMap = {
		// 'Pause': _ => {
		// 		vc.TogglePause();
		// 	},
		// 'p': _ => {
		// 		vc.TogglePause();
		// 	},
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
		// 'ScrollLock': _ => {
		// 		vc.ResizeTankToWindow();
		// 	},
		// 's': _ => {
		// 		vc.SaveTank();
		// 	},
		// 'a': _ => {
		// 		vc.LoadTank();
		// 	},
		// '1': _ => {
		// 		// vc.ToggleShowSensors();
		// 		render_styles.push( render_styles.shift() );
		// 		vc.SetRenderStyle( render_styles[0] );
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
				// else if ( vc.focus_object ) { vc.StopTrackObject(); }
				setPanelMode(null);
			},
		// 'c': _ => {
		// 		vc.CinemaMode( !vc.camera.cinema_mode );
		// 	},
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
		// 'End': _ => {
		// 		vc.ToggleSimulatorFF();
		// 	},
		// 'i': _ => {
		// 		if ( vc.focus_object ) {
		// 			show_boid_details.value = !show_boid_details.value;
		// 			if ( show_boid_details.value ) {
		// 				b.show_sensors = true;
		// 				RefreshBoidDetailsDynamicObjects( vc.focus_object );
		// 			}
		// 		}
		// 	},
		// 't': _ => {
		// 		if ( vc.focus_object ) { vc.StopTrackObject(); }
		// 		else {
		// 			const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		// 			vc.TrackObject(b);
		// 			if ( show_boid_details.value ) {
		// 				RefreshBoidDetailsDynamicObjects( vc.focus_object );
		// 			}						
		// 		}
		// 	},
		// 'l': _ => {
		// 		const b = vc.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		// 		if ( b ) console.log(b);
		// 	},
	}

	function onkeydown(event) {
		if ( event.key in keyFunctionMap ) {
			event.preventDefault();
			keyFunctionMap[event.key]();
		}
	};
	
	// mouse event handling state variables
	let dragging = false;
	let dragged = false; // detects if movement was made during mouse down
	let idle_for = 0;
	let is_idle = false;
	
	function onwheel(event) {
		camera.ZoomAt( event.clientX, event.clientY, event.deltaY > 0 );
	}
	
	function onclick (event) {
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
				radius: Math.min( 60, 60 / camera.scale ) // pixels in world space
			};
			api.SendMessage('pickObject', params);
		}
	}
	
	function onmousedown(event) {
		if ( event.button > 1 ) { return true; }
		dragging = true;
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
		if ( dragging ) {
			camera.MoveCamera( -event.movementX, -event.movementY );
			dragged = true;
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

<svelte:window {onkeydown} />

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
			<SimulatorControlsPanel></SimulatorControlsPanel>
		{:else if panel_mode==='tank_stats'}
			<TankStatsPanel bind:this={tank_stats_compo}></TankStatsPanel>
		{:else if panel_mode==='settings'}
			<CameraSettingsPanel></CameraSettingsPanel>
		{:else if panel_mode==='boid_library'}
			<BoidLibraryPanel></BoidLibraryPanel>
		{:else if panel_mode==='sim_launcher'}
			<SimulationLauncherPanel></SimulationLauncherPanel>
		{/if}
		
	</main>
	
	<aside>
		<FocusObjectDetails bind:this={focus_object_panel}></FocusObjectDetails>
	</aside>
</div>