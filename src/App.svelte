<script>

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
		
	let vc_canvas;
	let tank_stats_compo;
	
	let panel_mode = null;
	
	let renderLayers = {};
			
	function setPanelMode( mode ) {
		panel_mode = panel_mode == mode ? null : mode;
	}

	// vectorcosm simulation runs in a worker thread
	let worker = null;

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
	}

	gameloop.onStartDrawing = () => {
		// see about addressing the component directly
		if ( globalThis.two ) { globalThis.two.update(); }
	}
	
	// set up the main vectorcosm worker thread
	worker = new Worker(
		new URL('./workers/vectorcosm.worker.js', import.meta.url),
		// options
		{ type: 'module' }
	);
	
	// use the API to send and receive messages to Vectorcosm
	const api = new VectorcosmAPI( worker );
	
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
							let anchors = o.geodata.points.map( p => new Two.Anchor( p[0], p[1] ) );
							geo = globalThis.two.makePath(anchors);
							Object.assign( geo, o.geodata ); 
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
						geo = globalThis.two.makeCircle( 0, 0, o?.r || 6 );
						geo.fill = 'pink';
						geo.stroke = 'transparent';
						geo.linewidth = 0;
						if ( o.geodata ) { 
							Object.assign( geo, o.geodata ); 
						}
					}
					else if ( o.type=='plant' ) {
						geo = globalThis.two.makeRectangle( 0, 0, 100, 100 );
						geo.fill = 'transparent';
						geo.stroke = 'lime';
						geo.linewidth = 2;
					}
					else if ( o.type=='mark' ) {
						geo = globalThis.two.makeCircle( 0, 0, 100 );
						geo.fill = 'transparent';
						geo.stroke = 'magenta';
						geo.linewidth = 1;
					}
					else {
						geo = globalThis.two.makeRectangle( 0, 0, 10, 10 );
						geo.fill = '#BBBBBB';
						geo.stroke = 'transparent';
						geo.linewidth = 0;
					}
					if ( geo ) {
						if ( 'x' in o ) { geo.position.x = o.x; }
						if ( 'y' in o ) { geo.position.y = o.y; }
						if ( 'a' in o ) { geo.rotation = o.a; }
						if ( 's' in o ) { geo.scale = o.s; }
						if ( 'opacity' in o ) { geo.opacity = o.opacity; }
						o.geo = geo;
						renderLayers['fg'].add(geo);
					}
					// geo.opacity = o.o;
					renderObjects.set(o.oid, o);
					found.add(o);
				}
				// existing objects
				else {
					const obj = renderObjects.get(o.oid);
					for ( let k in o ) {
						obj[k] = o[k];
					}
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
			tank_stats_compo.updateTankStats(data);
		}
	} );
	
	// gameloop starts when drawing context is fully mounted (see component)
	function onDrawingReady() {
		// initialize the sim
		const params = {
			width:globalThis.two.width * 3,
			height:globalThis.two.height * 3
		};
		api.SendMessage('init',params);
		gameloop.Start();
		// create rendering layers before drawing objects start to arrive from simulation
		renderLayers['bg'] = globalThis.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		renderLayers['fg'] = globalThis.two.makeGroup(); // parallax backdrop needs to stay separate from tank
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
	
Camera


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
		width: 100%; 
		flex: 100 1 auto; 
		padding: 1rem; 
		order: 1;	
	}
</style>

<div id="pagewrapper" data-theme="dark" style="display:relative; display:flex; flex-flow: column wrap; ">
	
	<VectorcosmDrawingContext bind:this={vc_canvas} on:drawingReady={onDrawingReady}></VectorcosmDrawingContext>
	
	<main>
		<div class="nav">
			<button onclick={_ => setPanelMode('sim_controls')}	
				class:selected={panel_mode=='sim_controls'} 
				title="Simulation Controls"
				aria-label="Simulation Controls" 
				class="icon-sliders"></button>	&nbsp;
			<button onclick={_ => setPanelMode('tank_stats')} 	
				class:selected={panel_mode=='tank_stats'} 
				title="Tank Stats"
				aria-label="Tank Stats" 
				class="icon-chart-bar"></button>	&nbsp;
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
		
		{#if panel_mode==='tank_stats'}
			<TankStatsPanel bind:this={tank_stats_compo}></TankStatsPanel>
		{:else if panel_mode==='sim_controls'}
			<SimulatorControlsPanel></SimulatorControlsPanel>
		{:else if panel_mode==='settings'}
			<CameraSettingsPanel></CameraSettingsPanel>
		{:else if panel_mode==='boid_library'}
			<BoidLibraryPanel></BoidLibraryPanel>
		{:else if panel_mode==='sim_launcher'}
			<SimulationLauncherPanel></SimulationLauncherPanel>
		{/if}
	</main>
	
</div>

