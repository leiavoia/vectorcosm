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
		this.fps = 0;
		this.fps_recs = [];
		this.width = 0;
		this.height = 0;
		this.scale = 1;

		this.sim_meta_params = {
			num_boids: null,
			segments: null
		};
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
		
		// subscribe to critical events
		let onSimCompleteSubscription = PubSub.subscribe('sim.complete', (msg, data) => {
			this.LoadNextSim();
		});
		
		this.LoadNextSim();
				
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
		this.tank.Sterilize(); 
		this.simulation.tank.boids = boids;
		this.simulation.Setup(); 
		this.simulation.turbo = was_turbo;
	}
	
	// if no volume is supplied, current volume will be used
	ResizeTankByVolume( new_volume ) {
		// we don't know the user's screen dimensions at this point, 
		// so the best we can do is scale existing tank dimensions.
		const current_volume = this.tank.width * this.tank.height;
		const scale = Math.sqrt( new_volume / current_volume );
		this.tank.Resize(this.tank.width * scale, this.tank.height * scale)
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
		
		PubSub.publish('frame-update', 'hello world!');
		// PubSub.publishSync('frame-update', 'hello world!');
										
	}		

	RunSimulator()	{
		if ( this.simulation && this.simulation.turbo && ( !this.simulation.settings?.timeout
			|| this.simulation.stats.round_time <= this.simulation.settings.timeout ) ) {
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
	
	ExportTank() {
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
			return JSON.stringify(scene).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
		}
	}
			
	LoadTank( json, settings ) {
		if (json) {
			this.tank.Kill();
			const scene = JSON.parse(json);
			this.tank = new Tank( scene.tank );
			this.tank.MakeBackground();
			settings = Object.assign( {
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
				tide: 600,
			}, settings ?? {} );
			this.sim_queue.push( new NaturalTankSimulation(this.tank,settings));
			this.LoadNextSim();
			this.tank.boids = scene.boids.map( o => {
				// let b = new Boid( this.width*0.25, this.height*0.25, this.simulation.tank, JSON.parse(json) );
				let b = new Boid( o.x || this.width*Math.random(), o.y || this.height*Math.random(), this.tank, o );
				b.angle = Math.random() * Math.PI * 2;		
				b.ScaleBoidByMass();
				return b;
			});
			this.tank.obstacles = scene.obstacles.map( x => new Rock(x) );
			this.tank.foods = scene.foods.map( x => new Food(x) );
			this.tank.plants = scene.plants.map( x => new Plant.PlantTypes[x.classname](x) );
			// hack settings back in
			this.simulation.settings.num_boids = scene.boids.length;
			this.simulation.settings.num_plants = scene.plants.length;
			this.simulation.settings.num_rocks = scene.obstacles.length;
		}		
	}
	
}