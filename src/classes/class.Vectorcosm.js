import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
// import Two from "two.js";
// import * as Chart from "chart.js";
import Chart from 'chart.js/auto';
// you can optimize package size by not including everything. see:
// https://www.chartjs.org/docs/latest/getting-started/integration.html
import * as utils from '../util/utils.js'
import Tank from '../classes/class.Tank.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import Plant from '../classes/class.Plant.js'
import { SimulationFactory, NaturalTankSimulation } from '../classes/class.Simulation.js'
import BrainGraph from '../classes/class.BrainGraph.js'
import { BoidFactory, Boid } from '../classes/class.Boids.js'
import PubSub from 'pubsub-js'
import * as TWEEN from '@tweenjs/tween.js'

export default class Vectorcosm {

	constructor() {
		// stuff for tracking game objects
		this.next_object_id = 0; // sequential uuid for communicating with UI
		
		// main game loop
		this.playing = false;
		this.last_update_ts = 0;
		this.last_update_delta = 0;
		
		this.simulation = null;
		this.tank = null;
		this.braingraph = null; // move me some day
		
		// world settings
		this.frames_per_turbo = 100;
		this.turbo_time_delta = 1/30;
		this.min_time_delta = 1/20;
		this.max_foods = 400;
		this.render_style = 'Natural'; // Natural, Vector, Zen, Grey
		this.animate_boids = true;
		this.animate_plants = true;
		this.plant_intro_method = 'grow'; // 'grow' or 'fade'
		this.plant_growth_animation_step = 0.05; // in seconds. reduces the number of geometry updates
		this.show_collision_detection = false;
		this.show_markers = true;
		this.show_ui = false;
		this.show_brainmap = false;
		this.boid_sensors_every_frame = false;
		this.responsive_tank_size = false;
		this.allow_hyperzoom = true;
		this.focus_object = null;
		this.focus_geo = null;
		this.fps = 0;
		this.fps_recs = [];
		this.width = 0;
		this.height = 0;
		this.scale = 1;

		this.sim_meta_params = {
			num_boids: null,
			segments: null
		};
		// subscriptions to critical events
		// this.frameUpdateSubscription = PubSub.subscribe('frame-update', (msg,data) => {
    	// 	console.log( msg, data );
		// });
		
	}
	
	Init( params ) {
				
		// set up tank
		const w = params?.width || 1920;
		const h = params?.height || 1080;
		this.tank = new Tank( w, h );
		this.tank.MakeBackground();
		
		// set up simulations so we have something to watch
		this.sim_queue = [
			// SimulationFactory(this.tank, 'turning_training_easy'),
			// SimulationFactory(this.tank, 'turning_training_medium'),
			// SimulationFactory(this.tank, 'turning_training_hard'),
			// SimulationFactory(this.tank, 'turning_training_xhard'),
			// SimulationFactory(this.tank, 'food_training_sim_easy'),
			// SimulationFactory(this.tank, 'food_training_sim_medium'),
			// SimulationFactory(this.tank, 'food_training_sim_hard'),
			// SimulationFactory(this.tank, 'food_training_sim_forever'),
			// SimulationFactory(this.tank, 'edge_training')
			// SimulationFactory(this.tank, 'petri_dish')
			// SimulationFactory(this.tank, 'treasure_hunt_easy'),
			// SimulationFactory(this.tank, 'treasure_hunt_hard'),
			// SimulationFactory(this.tank, 'treasure_hunt_perpetual'),
			// SimulationFactory(this.tank, 'obstacle_course'),
			// SimulationFactory(this.tank, 'race_track'),
			SimulationFactory(this.tank, 'natural_tank'),
		];
		
		this.LoadNextSim();
				
	}

	SetRenderStyle( style ) {
		// this.render_style = style;
		// // there are a few global issues we need to sort out first
		// if ( style != 'Natural' ) {
		// 	if ( this.tank.bg ) { this.tank.bg.visible = false; }
		// 	globalThis.vc.animate_boids = false;
		// 	globalThis.vc.animate_plants = false;
		// 	let bg_theme = 'Abysmal';
		// 	if ( style == 'Zen' ) { bg_theme = 'White'; }
		// 	else if ( style == 'Grey' ) { bg_theme = 'Grey'; }
		// 	this.tank.SetBGTheme( bg_theme, false ); // don't save
		// }
		// else {
		// 	if ( this.tank.bg ) { this.tank.bg.visible = true; }
		// 	this.tank.SetBGTheme();
		// 	globalThis.vc.animate_boids = true;
		// 	globalThis.vc.animate_plants = true;
		// }
		// // we need to update all the objects currently in the world and force them to switch geometry
		// for ( let x of this.tank.boids ) { x.body.UpdateGeometry(); }
		// for ( let x of this.tank.obstacles ) { x.UpdateGeometry(); }
		// for ( let x of this.tank.foods ) { x.UpdateGeometry(); }
		// for ( let x of this.tank.plants ) { x.CreateBody(); }
	}
	
	ToggleShowMarkers() {
		// this.show_markers = !this.show_markers;
		// this.tank.marks.forEach( m => m.geo.visible = this.show_markers );
	}
	
	ResetCameraZoom() {
	}
	
	LoadStartingPopulationFromFile(file) {
		return fetch( file, { headers: { 'Accept': 'application/json' } } )
		.then(response => response.json())
		.then(data => {
			const n = this.simulation.settings.num_boids;
			this.simulation.SetNumBoids(0); // clear tank of generic boids
			for ( let j of data ) {
				let brain = neataptic.Network.fromJSON(j);
				const b = BoidFactory(this.simulation.settings.species, this.width*0.25, this.height*0.25, this.simulation.tank );
				b.brain = brain;
				b.angle = Math.random() * Math.PI * 2;		
				this.simulation.tank.boids.push(b);	
			}
			this.simulation.SetNumBoids(n); // back to normal
		});
	}
	
	LoadNextSim() {
		let boids = this.simulation ? this.simulation.tank.boids.splice(0,this.simulation.tank.boids.length) : [];
		const was_turbo = this.simulation ? this.simulation.turbo : false; 
		this.simulation = this.sim_queue.shift();
		// if the simulation is empty create a natural tank environment
		if ( !this.simulation ) { 
			this.simulation = SimulationFactory(this.tank, 'natural_tank');
		}
		// meta params that carry over from sim to sim
		if ( this.sim_meta_params.num_boids > 0 ) { this.simulation.settings.num_boids = this.sim_meta_params.num_boids; }
		if ( this.sim_meta_params.segments > 1 ) { this.simulation.settings.segments = this.sim_meta_params.segments; }
		this.simulation.onComplete = _ => this.LoadNextSim();
		this.tank.Sterilize(); 
		this.simulation.tank.boids = boids;
		this.simulation.Setup(); 
		this.simulation.turbo = was_turbo;
		// [!]HACK
		if ( typeof(this.onSimulationChange) === 'function' ) {
			this.onSimulationChange(this.simulation);
		}
	}
	
	Play() {
		// this.playing = true;
		// while ( this.playing ) {
		// 	// calculate time delta from last frame
		// 	let now = performance.now();
		// 	let delta = ( now - this.last_update_ts ) / 1000;
		// 	this.last_update_ts = now;
		// 	this.last_update_delta = delta;
			this.update(1/30);
			setTimeout( _ => this.Play(), 200 );
		// }
	}

	SetViewScale( scale ) {
		// const prev_scale = this.renderLayers['tank'].scale;
		// this.width = two.width;
		// this.height = two.height;
		// this.scale = utils.clamp( scale, 0.01, 5 );
		// this.renderLayers['tank'].scale = this.scale;
		// // small adjustment to keep screen centered
		// const xdiff = ( this.width * prev_scale ) - ( this.width * this.scale );
		// this.renderLayers['tank'].position.x += xdiff * 0.5;
		// const ydiff = ( this.height * prev_scale ) - ( this.height * this.scale );
		// this.renderLayers['tank'].position.y += ydiff * 0.5;
		// if ( this.braingraph ) {
		// 	this.braingraph.onScreenSizeChange();
		// }
	}
	
	// if force is FALSE, `responsive_tank_size` setting will be honored
	ResizeTankToWindow( force=false ) {
	}

	update( delta=0 ) {
		
		// fix delta supplied in ms
		if ( delta && delta > 1 ) { delta /= 1000; }
		
		// Record FPS before it gets rectified next.
		// NOTE: if turbo is active, it calculates the average outside this function.
		if ( !this.simulation.turbo ) {
			this.fps_recs.push(1/delta);
			if ( this.fps_recs.length > 20 ) { this.fps_recs.shift(); }
			this.fps = this.fps_recs.reduce( (a,b) => a+b, 0 ) / this.fps_recs.length;
		}
				
		// 20 FPS minimum. beware of spikes from pausing
		delta = Math.min( delta, this.min_time_delta); 
		
		// update tank conditions
		if ( this.tank ) {
			this.tank.Update(delta);
		}
		
		// update simulation		
		if ( this.simulation ) {
			this.simulation.Update(delta);
		}			
		
		// collision detection setup - not the best place for this, but works for now
		this.tank.grid.Clear();
		// only add boids if they need to detect each other. significant speedup
		// is possible on test environments where boids act in isolation.
		if ( globalThis.vc.simulation.settings?.ignore_other_boids !== true ) {
			for ( let b of this.tank.boids ) { this.tank.grid.Add(b); }
		}
		for ( let o of this.tank.obstacles ) { this.tank.grid.Add(o); }
		for ( let f of this.tank.foods ) { this.tank.grid.Add(f); }
		for ( let m of this.tank.marks ) { this.tank.grid.Add(m); }
		
		// update all boids
		for ( let i = this.tank.boids.length-1; i >= 0; i-- ) {
			const b = this.tank.boids[i];
			b.Update(delta);
			// b.collision.contact_obstacle = false;
			if ( b.dead ) {
				this.tank.boids.splice(i,1);
			}
		}
		
		// update plants
		for ( let i = this.tank.plants.length-1; i >= 0; i-- ) {
			const plant = this.tank.plants[i];
			plant.Update(delta);
			if ( plant.dead ) {
				this.tank.plants.splice(i,1);
			}
		}
		
		// update food
		for ( let i = this.tank.foods.length-1; i >= 0; i-- ) {
			const food = this.tank.foods[i];
			food.Update(delta);
			if ( food.dead || !food.value ) {
				this.tank.foods.splice(i,1);
			}
		}
		
		// update marks
		for ( let i = this.tank.marks.length-1; i >= 0; i-- ) {
			const m = this.tank.marks[i];
			m.Update(delta);
			if ( m.dead ) {
				this.tank.marks.splice(i,1);
			}
		}
		
		// braingraph the leader
		// this.DrawBrainGraph();
		
		// track any object that has focus
		// if ( this.focus_object ) { this.TrackObject(this.focus_object); }
		
		// tweening - mostly for camera movement
		// TWEEN.update( /* requires absolute time. deltas dont work */ );
		
		PubSub.publish('frame-update', 'hello world!');
		// PubSub.publishSync('frame-update', 'hello world!');
										
	}		

	AddShapeToRenderLayer( geo, layer='0' ) {
		// try {
		// 	this.renderLayers[layer].add(geo);
		// }
		// catch (error) {
		// 	console.warn('no drawing layer named ' + layer);
		// }
	}
	
	DrawBrainGraph() {
		// if ( this.show_brainmap && !this.simulation.turbo ) {
		// 	// anything to track?
		// 	if ( this.tank.boids.length ) {	
		// 		let target = this.focus_object || this.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
		// 		this.TrackObject(target);
		// 		this.braingraph =  this.braingraph ?? new BrainGraph(target, this.two);
		// 		this.braingraph.setTarget(target);
		// 		this.braingraph.Draw();
		// 	}
		// 	// otherwise close
		// 	else if ( this.braingraph ) {
		// 		this.braingraph.Kill();
		// 		this.braingraph = null;				
		// 	}
		// }
		// else if ( this.braingraph ) {
		// 	this.braingraph.Kill();
		// 	this.braingraph = null;				
		// }
	}
			
	TrackObject(o) {
		// if ( !o ) { return; }
		// if ( o.dead ) {
		// 	if ( this.focus_object == o ) { this.StopTrackObject(); }
		// 	return;
		// }
		// o.show_sensors = this.camera.show_boid_sensors_on_focus;
		// o.DrawBounds(this.camera.show_boid_collision_on_focus);
		// if ( this.focus_object && this.focus_object !== o ) { 
		// 	delete this.focus_object.show_sensors;
		// 	this.focus_object.DrawBounds(false);
		// }
		// this.focus_object = o;
		// if ( !this.focus_geo ) {
		// 	const focus_radius = 80
		// 	this.focus_geo = this.two.makeCircle(this.focus_object.x, this.focus_object.y, focus_radius);
		// 	this.focus_geo.stroke = '#AEA';
		// 	this.focus_geo.linewidth = 3;
		// 	this.focus_geo.fill = 'transparent';
			
		// 	// const grad = globalThis.two.makeRadialGradient(0, 0, focus_radius, 
		// 	// 	new Two.Stop(0,'transparent'), 
		// 	// 	new Two.Stop(0.8,'#AAEEAA00'), 
		// 	// 	new Two.Stop(1,'#AAEEAAAA')
		// 	// );
		// 	// grad.units = 'userSpaceOnUse'; // super important
		// 	// this.focus_geo.stroke = 'transparent';
		// 	// this.focus_geo.linewidth = 0;
		// 	// this.focus_geo.fill = grad;
			
		// 	this.focus_geo.visible = this.camera.show_boid_indicator_on_focus;
		// 	this.AddShapeToRenderLayer(this.focus_geo);
		// }
		// else {
		// 	this.focus_geo.position.x = this.focus_object.x;
		// 	this.focus_geo.position.y = this.focus_object.y;
		// 	this.PointCameraAt( this.focus_object.x, this.focus_object.y );
		// }
		// // this.focus_object.DrawBounds();
	}
	
	StopTrackObject() {
		// if ( !this.focus_object ) { return ; }
		// delete this.focus_object.show_sensors;
		// this.focus_object.DrawBounds(false);
		// this.focus_object = null;
		// if ( this.focus_geo ) {
		// 	this.focus_geo.remove();
		// 	this.focus_geo = null;
		// }
	}
	
	ScreenToWorldCoord( x, y ) {
		// x = ( x - this.renderLayers['tank'].position.x ) / this.scale;
		// y = ( y - this.renderLayers['tank'].position.y ) / this.scale;
		// return [x,y];
	}
	
	SetShowUI(x) {
		this.show_ui = !!x;
		let el = document.getElementById('ui_container');
		if ( this.show_ui ) { el.style.visibility = 'visible'; }
		else { el.style.visibility = 'hidden'; }
	}
	
	ToggleUI() {
		this.SetShowUI( !this.show_ui );
	}
	
	SetShowSensors(x) {
		this.show_collision_detection = !this.show_collision_detection;
	}
	
	ToggleShowSensors() {
		this.SetShowSensors( !this.show_collision_detection );
	}
	
	ToggleShowBrainmap() {
		if ( this.show_brainmap ) { this.StopTrackObject(); }
		this.show_brainmap = !this.show_brainmap;
	}

	RunSimulator()	{
		if ( this.simulation && this.simulation.turbo && ( !this.simulation.settings?.time
			|| this.simulation.stats.round.time <= this.simulation.settings.time ) ) {
			// freeze automatic  screen drawing
			// if ( this.two.playing ) { this.two.pause(); }
			// we want to measure the actual FPS using performance counter
			let start = performance.now();
			// process frames in bulk
			for ( let n=0; n < this.frames_per_turbo; n++ ) {
				// ++this.two.frameCount; // fake it
				this.update( this.turbo_time_delta );
			}
			// measure average performance
			let end = performance.now();
			let delta = end - start;
			this.fps = 1 / ( ( delta / 1000 ) / this.frames_per_turbo );
			// manually draw the screen once in a while
			// --this.two.frameCount;
			// this.two.update();
			setTimeout( _ => this.RunSimulator(), 1000 );
		}
		else {
			this.playing = true;
			// this.two.play();
		}
	}
	
	ToggleSimulatorFF() {
		if ( !this.simulation ) { return false; }
		this.simulation.turbo = !this.simulation.turbo;
		if ( this.simulation.turbo ) { this.RunSimulator(); }
	}
	TogglePause() {
		this.playing = !this.playing;
	}
		
	SaveLeader() {
		if ( this.simulation.tank.boids.length ) {
			const b = this.simulation.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
			localStorage.setItem("leader", b.Export(true));
		}		
	}

	LoadLeader() {
		let json = localStorage.getItem("leader");
		if (json) {
			let b = new Boid( this.width*0.25, this.height*0.25, this.simulation.tank, JSON.parse(json) );
			b.angle = Math.random() * Math.PI * 2;		
			b.ScaleBoidByMass();
			this.simulation.tank.boids.push(b);				
		}		
	}
	
	SavePopulation() {
		if ( this.simulation.tank.boids.length ) {
			let jsons = [];
			for ( const b of this.simulation.tank.boids ) {
				jsons.push( b.Export(false) );
			}
			let str = JSON.stringify(jsons).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
			localStorage.setItem("population", str);
		}		
	}
			
	LoadPopulation() {
		let json = localStorage.getItem("population");
		if (json) {
			json = JSON.parse(json);
			for ( let j of json ) {
				let b = new Boid( this.width*0.25, this.height*0.25, this.simulation.tank, j );
				b.angle = Math.random() * Math.PI * 2;		
				b.ScaleBoidByMass();
				this.simulation.tank.boids.push(b);	
			}			
		}		
	}
	
	SaveTank() {
		if ( this.tank ) {
			//
			// TODO: it would be nice to save the sim params too
			//
			const scene = {
				tank: this.tank.Export(),
				boids: this.tank.boids.map( x => x.Export() ),
				obstacles: this.tank.obstacles.map( x => x.Export() ),
				foods: this.tank.foods.map( x => x.Export() ),
				plants: this.tank.plants.map( x => x.Export() ),
			};
			let str = JSON.stringify(scene).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
			localStorage.setItem("tank", str);
		}
	}
			
	LoadTank() {
		let json = localStorage.getItem("tank");
		if (json) {
			this.tank.Kill();
			const scene = JSON.parse(json);
			this.tank = new Tank( scene.tank );
			this.tank.MakeBackground();
			this.ResetCameraZoom();
			this.sim_queue.push( new NaturalTankSimulation(this.tank,{
				name: 'Saved Tank',
				time: 0,
				num_boids: 0,
				num_plants: 0,
				num_rocks: 0,
				num_foods: 0,
				food_friction:true,
				random_boid_pos: true,
				max_mutation: 0.2,
				current: 0.1,
				food_friction: true,
				tide: 600,
				// scale: 0.5,
			}));
			this.LoadNextSim();
			this.tank.boids = scene.boids.map( o => {
				// let b = new Boid( this.width*0.25, this.height*0.25, this.simulation.tank, JSON.parse(json) );
				let b = new Boid( o.x || this.width*math.random(), o.y || this.height*math.random(), this.tank, o );
				b.angle = Math.random() * Math.PI * 2;		
				b.ScaleBoidByMass();
				return b;
			});
			this.tank.obstacles = scene.obstacles.map( x => new Rock(x) );
			this.tank.foods = scene.foods.map( x => new Food(x) );
			this.tank.plants = scene.plants.map( x => new Plant.PlantTypes[x.classname](x) );
			// [!]hack
			// for ( let p of this.tank.plants ) {
			// 	globalThis.vc.AddShapeToRenderLayer( p.geo, 0 );
			// }
			// hack settings back in
			this.simulation.settings.num_boids = scene.boids.length;
			this.simulation.settings.num_plants = scene.plants.length;
			this.simulation.settings.num_rocks = scene.obstacles.length;
		}		
	}
	
}