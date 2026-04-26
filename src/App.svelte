<script>

	import FocusObjectDetails from './ui/FocusObjectDetails.svelte';
	import TankStatsPanel from './ui/TankStatsPanel.svelte';
	import PerfStatsPanel from './ui/PerfStatsPanel.svelte';
	import RecordsPanel from './ui/RecordsPanel.svelte';
	import SimStatsPanel from './ui/SimStatsPanel.svelte';
	import SimulatorControlsPanel from './ui/SimulatorControlsPanel.svelte';
	import SimulationLauncherPanel from './ui/SimulationLauncherPanel.svelte';
	import BoidLibraryPanel from './ui/BoidLibraryPanel.svelte';
	import TankLibraryPanel from './ui/TankLibraryPanel.svelte';
	import CameraSettingsPanel from './ui/CameraSettingsPanel.svelte';
	import VectorcosmDrawingContext from './ui/VectorcosmDrawingContext.svelte';
	import GameLoop from './classes/class.GameLoop.js'
	import VectorcosmAPI from './classes/class.VectorcosmAPI.js'
	import Camera from './classes/class.Camera.svelte.js'
	import Two from "two.js";
	import * as SVGUtils from './util/svg.js'
	import { parseSimParams } from './util/url-params.js'
	import { setContext } from 'svelte';
	import {StatTracker, CompoundStatTracker} from './classes/class.StatTracker.js'
	import { AnimateFood, AnimatePlant, AnimateMark, AnimateBoid } from './util/animate.js'
	import { renderTankCurrent, renderTankLightMap, renderTankHeatMap, renderTankMatterMap } from './util/tank-env-overlay.js'

	let renderLayers = {};
	let drawingThemeClass = $state('bg-theme-black');
	let simRoundCompleteToken = $state(0);
	let focusObjectBoidData = $state(null);
	let focusObjectGraphDataPoint = $state(null);
	let focusObjectGraphDataToken = $state(0);
	let focusObjectBrainGraphForce = $state(null);
	let boidLibraryRefreshToken = $state(0);
	let tankLibraryRefreshToken = $state(0);

	function NotifyBoidLibraryChanged() {
		boidLibraryRefreshToken++;
	}

	function NotifyTankLibraryChanged() {
		tankLibraryRefreshToken++;
	}

	function NormalizeBgThemeClass( name ) {
		if ( !name ) { return 'bg-theme-black'; }
		return 'bg-theme-' + name.replace('bg-theme-','');
	}
			
	// control UI panel display - only one allowed at a time
	let panel_mode = $state(null);
	function setPanelMode( mode ) {
		panel_mode = panel_mode == mode ? null : mode;
	}
	setContext('setPanelMode', setPanelMode); // allows panels to self-close

	// performance tracking
	let performanceTracker = new CompoundStatTracker( { numLayers: 2, base: 10, recordsPerLayer: 60, stats:[
		'fps',
		'delta',
		'drawtime',
		'simtime',
		'waittime',
	] });

	// tank records tracking - mirrors what the simulation is also tracking on the backend
	let recordsTracker = new CompoundStatTracker( { numLayers: 4, base: 10, recordsPerLayer: 30, stats:[
		'boids',
		'foods',
		'plants',
		'boid_mass',
		'food_mass',
		'species',
		'avg_age',
		'births',
		'deaths',
		'food_eaten',
		'energy_used',
		'bites',
		'kills',
	] });
	
	// tank object tracking
	// let tankStatTracker = new CompoundStatTracker( { numLayers: 3, base: 6, recordsPerLayer:20, stats:['boids','foods','bfratio'] });

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

	gameloop.onStartFrame = () => {
		// update all your stats here
		performanceTracker.Insert({
			fps: gameloop.fps,
			delta: gameloop.delta,
			drawtime: gameloop.drawtime,
			simtime: gameloop.simtime,
			waittime: gameloop.waittime,
		});			
	}

	gameloop.onStartSim = delta => {
		const data = {
			num_frames: gameloop.updates_per_frame, // variable turbo
			delta: ( gameloop.updates_per_frame > 1 ? gameloop.max_delta : delta ),
			inc_boid_animation_data: (camera && camera.animate_boids) ? true : false,
			inc_mark_animation_data: (camera && camera.animate_marks) ? true : false,
			inc_food_animation_data: (camera && camera.animate_foods) ? true : false,
			inc_plant_animation_data: (camera && camera.animate_plants) ? true : false,
		};
		api.send('update', data);
		// update or cancel object tracking
		if ( camera ) {
			if ( camera.focus_obj_id > 0 ) {
				// ask for first-time data if this is a new object we are tracking
				let obj = renderObjects.get(camera.focus_obj_id);
				let needs_sensors = obj && obj.geodata && !('sensors' in obj.geodata);
				let needs_brain = obj && obj.geodata && !('brain_struct' in obj.geodata);
				const params = {
					oid: camera.focus_obj_id,
					inc_sensor_geo: needs_sensors,
					inc_brain: needs_brain
				}
				api.call('pick_object', params).then(onPickObjectResponse); // send back for another round
			}
			else {
				focusObjectBoidData = null;
			}
		}
	}

	gameloop.onStartDrawing = () => {
		if ( camera ) {
			const t = performance.now();
			camera.Render();
			gameloop.drawtime = ( performance.now() - t ) / 1000; // seed with camera render cost
		}
	}
	
	// create a map of all drawable objects. these are coming from the vectorcosm worker.
	// this map contains the necessary info to draw and animate the objects.
	// they are keyed by an object_id (oid) supplied by vectorcosm. 
	let renderObjects = new Map();
	setContext('renderObjects', renderObjects); // allows child elements to do lookups
	
	// tank stats we track each frame
	let tankStats = $state.raw({});
	let simStats = $state.raw({});
	let simSettings = $state({});
	
	// for each type of message we want to send, set up a callback to handle the response
	api.on( 'frame', data => {
		// End sim phase first (records pure worker roundtrip time), then begin draw phase
		gameloop.EndSimFrame();
		gameloop.drawtime_ts = performance.now();
		if ( globalThis.two ) {
			// keep track of what there is so we can remove what there aint
			const found = new WeakSet();
			for ( let o of data.renderObjects ) {
				// if new geodata is supplied, treat as a new object
				if ( o?.geodata && renderObjects.has(o.oid) ) {
					const obj = renderObjects.get(o.oid);
					if ( 'geo' in obj ) {
						SVGUtils.RemoveUnusedGradients(obj.geo);
						obj.geo.remove();
						globalThis.two.release(obj.geo);
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
							if ( o.geodata.bg_theme_class ) {
								drawingThemeClass = NormalizeBgThemeClass(o.geodata.bg_theme_class);
							}
							
							// tank frame is a fixed size
							geo = globalThis.two.makeRectangle(o.geodata.width/2, o.geodata.height/2, o.geodata.width, o.geodata.height );
							geo.stroke = "#888888";
							geo.linewidth = '2';
							geo.fill = 'transparent';	
							renderLayers['ui'].add(geo);
							
							// remove old background triangles - loop backwards over children and remove each one
							for ( let i=renderLayers['bg'].children.length-1; i>=0; i-- ) {
								const child = renderLayers['bg'].children[i]
								child.remove();
								globalThis.two.release(child);
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
							
							// set up a camera
							if ( !camera ) {
								camera = new Camera( renderLayers, renderObjects );
								camera.window_width = two.width;
								camera.window_height = two.height;
								camera.background_attachment = 'screen'; // or 'tank'
							}
							camera.tank_width = o.geodata.width;
							camera.tank_height = o.geodata.height;
							camera.ResetCameraZoom();
							camera.RescaleBackground();
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
						// hack: animated plants exhibit a large, unsatisfactory "pop" 
						// when being rendered in full here, then being shifted by next frame.
						// if the camera is animating plants in the first few frames of a sim, turn the 
						// plant rendering off and let the animation function to it back on later.
						if ( camera && camera.animate_plants ) { geo.visible = false; }
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
					if ( 'geo' in obj ) { 
						SVGUtils.RemoveUnusedGradients(obj.geo);
						obj.geo.remove(); 
						globalThis.two.release(obj.geo);
					}
					renderObjects.delete(oid);
				}
			}
			// animate objects
			// TODO: pre-assign animation function to objects to avoid if statements
			if ( gameloop.updates_per_frame === 1 && camera && (camera.animate_boids || camera.animate_plants || camera.animate_foods || camera.animate_marks) ) {
				for ( let o of renderObjects.values() ) {
					if ( o.type == 'boid' && o.geo && camera.animate_boids) {
						AnimateBoid(o, camera, gameloop);
					}
					else if ( o.type == 'mark' && o.geo && camera.animate_marks ) {
						AnimateMark(o);
					}
					else if ( o.type == 'food' && o.geo && camera.animate_foods ) {
						AnimateFood(o, camera);
					}
					else if ( o.type == 'plant' && o.geo && camera.animate_plants ) {
						AnimatePlant(o, simStats);
					}
				}
			}
		}
		// simStats and tankStats are now sent every frame
		if ( gameloop.updates_per_frame <= 1 ) {
			data.tankStats.SVGs = SVGUtils.CountSVGElements(globalThis.two.scene);
		}
		tankStats = data.tankStats;
		// settings sub-object only sent when dirty — preserve previous value when absent
		if ( data.simStats.settings ) {
			simStats = data.simStats;
		}
		else {
			simStats = { ...data.simStats, settings: simStats.settings };
		}
		simStats.fps = gameloop.updates_per_frame > 1
			? (gameloop.fps * gameloop.updates_per_frame).toFixed(0)
			: gameloop.fps_avg.toFixed(0);
		gameloop.EndDrawing();
	});
		
	// NOTE: this is called every frame while an object is in focus.
	// It is possible for the callback to respond after user has deselected a focus object,
	// causing it to re-focus. To detect this situation, take of presence of sensor_geo
	// which is only sent on the first frame and can be used to understand if this is the
	// first frame or a repeat request
	function onPickObjectResponse( data ) {
		const focus_object_id = data ? data.oid : 0;
		// capture brain in case we want to display braingraph
		if ( data && data?.brain_struct ) {
			const obj = renderObjects.get(focus_object_id);
			if ( obj && 'geodata' in obj && !('brain_struct' in obj.geodata) ) {
				obj.geodata.brain_struct = data.brain_struct;
			}
		}
		// capture any sensor geometry so we can use it later
		if ( data && data?.sensor_geo ) {
			const obj = renderObjects.get(focus_object_id);
			if ( obj && 'geodata' in obj && !('sensors' in obj.geodata) ) {
				obj.geodata.sensors = data.sensor_geo;
			}
		}
		// likely a repeat request that came back too late - disregard
		else if ( camera.focus_obj_id <= 0 ) {
			focusObjectBoidData = null;
			return;
		}
		// rapid change in target object
		else if ( camera.focus_obj_id > 0 && focus_object_id && focus_object_id != camera.focus_obj_id ) {
			return;
		}
		// track objects and update UI
		camera.TrackObject(focus_object_id);
		if ( !data || camera.show_boid_info_on_focus ) { // respect camera settings even though its not actually camera related
			focusObjectBoidData = data;
		}
	}
	
	let simChartData = $state.raw({
		averages:[],
		highscores:[],
		labels:[]
	});
		
	api.on( 'sim_round', data => {
		simChartData.averages.push( data.round_avg_score );
		simChartData.highscores.push( data.round_best_score );
		simChartData.labels.push( data.round_num );
		simRoundCompleteToken++;
	} );
	
	api.on( 'sim_complete', data => {
		// a series of trainings is completed - halt fast forward
		if ( !data.in_queue ) {
			gameloop.updates_per_frame = 1; 	
		}
	} );
	
	api.on( 'sim_new', data => {
		camera.ResetCameraZoom();	
		simChartData.averages.length = 0;
		simChartData.highscores.length = 0;
		simChartData.labels.length = 0;
		// new sim, new settings
		if ( data ) {
			simSettings = data;
		}
		simRoundCompleteToken++;
	} );
	
	api.on( 'records_push', msg => {
		if ( msg.layer == 0 ) {
			recordsTracker.Insert( msg.data );
		}
	} );
	
	api.on( 'boid_records_push', msg => {
		if ( msg.layer == 0 ) {
			focusObjectGraphDataPoint = msg.data;
			focusObjectGraphDataToken++;
		}
	} );
	
	api.on( 'autosave', data => {
		NotifyTankLibraryChanged();
	});
	
	function onExportBoidsResponse( str ) {
		if ( str ) {
			globalThis.localStorage.setItem("population", str);
		}
		NotifyBoidLibraryChanged();
	}
	
	const tankEnvRenderFunctions = {
		'current': renderTankCurrent,
		'light':   renderTankLightMap,
		'heat':    renderTankHeatMap,
		'matter':  renderTankMatterMap,
	};

	function onGetTankEnvDataResponse( data ) {
		const request = data.request || 'current';
		if ( tankEnvGeo ) { tankEnvGeo.remove(); tankEnvGeo = null; }
		const fn = tankEnvRenderFunctions[request];
		if ( fn ) {
			tankEnvGeo = fn(data, globalThis.two);
			renderLayers['ui'].add(tankEnvGeo);
		}
	}
		
	let tankEnvGeo = null;
	let tankEnvOverlayMode = null;

	function ToggleTankEnvironmentalData( request='current' ) {
		if ( tankEnvGeo && tankEnvOverlayMode == request ) {
			tankEnvGeo.remove();
			tankEnvGeo = null;
		}
		else {
			tankEnvOverlayMode = request;
			api.call('get_tank_env_data', {request:request}).then(onGetTankEnvDataResponse);
		}
	}
			
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
		const url_params = parseSimParams( new URLSearchParams(window.location.search) );
		const params = {
			width:  url_params.width  ?? globalThis.two.width  * 2,
			height: url_params.height ?? globalThis.two.height * 2,
			...url_params
		};
		api.send('init',params);
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
			// zoom out
			const newScale = camera.scale * (1/camera.zoom_step_factor);
			const diff = newScale - camera.scale;
			camera.MoveCamera(0, 0, diff);
		},
		'-': _ => {
			// zoom out
			const newScale = camera.scale * (1/camera.zoom_step_factor);
			const diff = newScale - camera.scale;
			camera.MoveCamera(0, 0, diff);
		},
		'=': _ => {
			// zoom in
			const newScale = camera.scale * camera.zoom_step_factor;
			const diff = newScale - camera.scale;
			camera.MoveCamera(0, 0, diff);
		},
		'+': _ => {
			// zoom in
			const newScale = camera.scale * camera.zoom_step_factor;
			const diff = newScale - camera.scale;
			camera.MoveCamera(0, 0, diff);
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
		's': _ => {
			api.call('save_tank').then(() => NotifyTankLibraryChanged());
		},
		'a': _ => {
			camera.dramatic_entrance = -1; // evaluates to "true" but resets to false on next action
			api.send('load_tank', { id:0, settings: $state.snapshot(simSettings) });
		},
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
			setPanelMode('object_library')
		},
		'5': _ => {
			setPanelMode('sim_launcher')
		},
		'6': _ => {
			ToggleTankEnvironmentalData('current');
		},
		'7': _ => {
			ToggleTankEnvironmentalData('light');
		},
		'8': _ => {
			ToggleTankEnvironmentalData('heat');
		},
		'm': _ => {
			ToggleTankEnvironmentalData('matter');
		},
		'Escape': _ => {
			if ( camera.focus_obj_id > 0 ) { 
				camera.TrackObject(false);
				focusObjectBoidData = null;
			}
			else { setPanelMode(null); }
		},
		'End': _ => {
			toggleFastForward();
		},
		'c': _ => {
			camera.CinemaMode( !camera.cinema_mode );
		},
		'b': _ => {
			// if we don't already have have focus, pick some random boid
			if ( camera.focus_obj_id <= 0 ) {
				let boid = Array.from(renderObjects.values()).find(o=>o.type=='boid');
				if ( boid ) { camera.TrackObject( boid.oid ); }
			}
			focusObjectBrainGraphForce = !focusObjectBrainGraphForce;
		},
		'9': _ => {
			api.call('export_boids').then(onExportBoidsResponse);
		},
		'0': _ => {
			const str = globalThis.localStorage.getItem("population");
			if ( str ) { api.send('load_boids', str ); }
		},
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
			globalThis.two.fit();
			if ( !camera ) { return; }
			camera.window_width = two.width;
			camera.window_height = two.height;			
			camera.RescaleBackground();
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
		if ( !camera ) { return; }
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
				inc_sensor_geo:true, // get boid sensor visualization on first request only
				inc_brain:true
			};
			camera.TrackObject(false); // unselect currently selected object
			api.call('pick_object', params).then(onPickObjectResponse);
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
		const now_tracking = camera && camera.focus_obj_id > 0 && camera.center_camera_on_focus;
		if ( dragging && !now_tracking ) {
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
		is_idle = idle_for >= 2;
		setTimeout( UpdateIdleTime, 500 );
	};
	
	function onSimulatorControlsUpdate(params) {
		api.send('update_sim_settings',params);
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
	div.nav.is_idle:not(.panel_open) {
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
	DIV.focus_object_panel {
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
	#pagewrapper main > * { pointer-events:auto; }
	.hidecursor { cursor: none; }
</style>

<svelte:window {onkeydown} {onresize} />

<div id="pagewrapper" data-theme="dark" class={[{hidecursor:is_idle}]}>
	<!-- 
		Vectorcosm two.js canvas area is fixed to the entire screen.
		all UI elements sit on top of it.
		this wrapper exists just to capture map-area events. 
		events originate from within the drawing divs and bubble out to here.
		this way we can keep the event handler logic up here.
	-->
	<div role="none" {onclick} {onwheel} {onmousedown} {onmouseup} {onmousemove} {oncontextmenu}>
		<VectorcosmDrawingContext themeClass={drawingThemeClass} onDrawingReady={onDrawingReady}></VectorcosmDrawingContext>
	</div>
	
	<main>
		<!-- all your normal UI elements go in here -->
		<div class={['nav', {panel_open:!!panel_mode}, {is_idle:is_idle}]}>
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
			<button onclick={_ => setPanelMode('object_library')}	
				class:selected={panel_mode=='object_library'} 
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
			<SimStatsPanel stats={simStats} chartdata={simChartData} roundCompleteToken={simRoundCompleteToken}></SimStatsPanel>
			<TankStatsPanel stats={tankStats} open={false}></TankStatsPanel>
		{:else if panel_mode==='tank_stats'}
			<TankStatsPanel stats={tankStats} open={true}></TankStatsPanel>
			<RecordsPanel records={recordsTracker} open={true}></RecordsPanel>
			<SimStatsPanel stats={simStats} chartdata={simChartData} roundCompleteToken={simRoundCompleteToken} open={false}></SimStatsPanel>
			<PerfStatsPanel tracker={performanceTracker} open={false}></PerfStatsPanel>
		{:else if panel_mode==='settings'}
			<CameraSettingsPanel camera={camera}></CameraSettingsPanel>
		{:else if panel_mode==='object_library'}
			<BoidLibraryPanel refreshToken={boidLibraryRefreshToken}></BoidLibraryPanel>
			<TankLibraryPanel {camera} refreshToken={tankLibraryRefreshToken}></TankLibraryPanel>
		{:else if panel_mode==='sim_launcher'}
			<SimulationLauncherPanel></SimulationLauncherPanel>
		{/if}
		
	</main>
	
	<div class="focus_object_panel">
		<FocusObjectDetails 
			boidData={focusObjectBoidData}
			graphDataPoint={focusObjectGraphDataPoint}
			graphDataToken={focusObjectGraphDataToken}
			forceShowBrainGraph={focusObjectBrainGraphForce}
			onBoidLibraryChanged={NotifyBoidLibraryChanged}
		></FocusObjectDetails>
	</div>
</div>