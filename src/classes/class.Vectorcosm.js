import Tank from '../classes/class.Tank.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import Plant from '../classes/class.Plant.js'
import BoidLibrary from '../classes/class.BoidLibrary.js'
import { SimulationFactory, NaturalTankSimulation } from '../classes/class.Simulation.js'
import { BoidFactory, Boid } from '../classes/class.Boids.js'
import PubSub from 'pubsub-js'
import {db} from '../classes/db.js'

export default class Vectorcosm {

	constructor() {
		// game objects
		this.next_object_id = 0; // sequential uuid for communicating with UI
		this.simulation = null;
		this.tank = null;
		
		// settings
		this.boid_sensors_every_frame = false;
		this.boid_snn_every_frame = false;
		this.min_time_delta = 1/30;
		this.max_foods = 400;
		this.sim_meta_params = {
			num_boids: null,
			segments: null,
			rounds: null
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
			// SimulationFactory(this.tank, 'peaceful_tank'),
		];
		
		// subscribe to critical events
		let onSimCompleteSubscription = PubSub.subscribe('sim.complete', (msg, data) => {
			this.LoadNextSim();
		});
		
		this.LoadNextSim();
				
	}

	// LoadStartingPopulationFromFile(file) {
	// 	return fetch( file, { headers: { 'Accept': 'application/json' } } )
	// 	.then(response => response.json())
	// 	.then(data => {
	// 		const n = this.simulation.settings.num_boids;
	// 		this.simulation.SetNumBoids(0); // clear tank of generic boids
	// 		for ( let j of data ) {
	// 			let brain = neataptic.Network.fromJSON(j);
	// 			const b = BoidFactory(this.simulation.settings.species, this.width*0.25, this.height*0.25, this.simulation.tank );
	// 			b.brain = brain;
	// 			b.angle = Math.random() * Math.PI * 2;		
	// 			this.simulation.tank.boids.push(b);	
	// 		}
	// 		this.simulation.SetNumBoids(n); // back to normal
	// 	});
	// }
	
	LoadNextSim() {
		// if the simulation queue is empty, save a copy of the final population
		if ( ! this.sim_queue.length ) { 
			this.SavePopulation( null, this.tank.boids.map(b=>b.oid), 'Trained Population' );
		}
		// temporarily remove boids from tank so they don't get sterilized
		let boids = this.simulation ? this.simulation.tank.boids.splice(0,this.simulation.tank.boids.length) : [];
		// start the next simulation; default to natural tank if queue is empty
		this.simulation = this.sim_queue.shift();
		if ( !this.simulation ) { 
			this.simulation = SimulationFactory(this.tank, 'natural_tank');
		}
		// meta params that carry over from sim to sim
		if ( this.sim_meta_params.num_boids > 0 ) { this.simulation.settings.num_boids = this.sim_meta_params.num_boids; }
		if ( this.sim_meta_params.segments > 1 ) { this.simulation.settings.segments = this.sim_meta_params.segments; }
		if ( this.sim_meta_params.rounds > 0 ) { this.simulation.settings.rounds = this.sim_meta_params.rounds; }
		// clean the tank and transplant boids back in
		this.tank.Sterilize(); 
		this.simulation.tank.boids = boids;
		this.simulation.Setup(); 
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
	}		

	SavePopulation( species=null, ids=null, to_db=false /* can also be a string label */ ) {
		if ( this.simulation.tank.boids.length ) {
			let list = this.simulation.tank.boids;
			if ( species ) {
				list = list.filter( x => x.species == species );
			}
			if ( ids ) {
				if ( !Array.isArray(ids) ) { ids = [ids]; }
				list = list.filter( x => ids.includes(x.oid) );
			}
			// if saving to database, push objects directly in
			if ( to_db ) {
				const lib = new BoidLibrary();
				let label = to_db !== true ? to_db : null;
				lib.Add( list, label );
			}
			// otherwise return JSON
			else {
				let jsons = [];
				for ( const b of list ) {
					jsons.push( b.Export(false) );
				}
				return JSON.stringify(jsons).replace(/\d+\.\d+/g, x => parseFloat(x).toPrecision(6) );
			}
		}		
	}
			
	LoadPopulation( json ) {
		// let json = localStorage.getItem("population");
		if (json) {
			json = JSON.parse(json);
			for ( let j of json ) {
				let b = new Boid( 0, 0, this.simulation.tank, j );
				b.ScaleBoidByMass();
				this.simulation.AddBoidToTank(b); // handles safe spawn
			}			
		}		
	}
	
	async SaveTank( id=0 ) {
		if ( this.tank ) {
			const scene = {
				tank: this.tank.Export(),
				boids: this.tank.boids.map( x => x.Export() ),
				obstacles: this.tank.obstacles.map( x => x.Export() ),
				foods: this.tank.foods.map( x => x.Export() ),
				plants: this.tank.plants.map( x => x.Export() ),
				sim_settings: this.simulation.settings,
			};
			const row = { id, scene, date: Date.now() };
			await db.tanks.put(row);
		}
	}
	
	async LoadTank( id=0, settings=null ) {
		if ( id >= 0 ) {
			const data = await db.tanks.get(id);
			if ( !data ) { return null; }
			const scene = data.scene;
			this.tank.Kill();
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
			settings = Object.assign( settings, scene.sim_settings );
			// manually recalculate the volume to make sure UI stays in sync
			settings.volume = this.tank.width * this.tank.height;
			this.sim_queue.push( new NaturalTankSimulation(this.tank,settings));
			this.LoadNextSim();
			this.tank.boids = scene.boids.map( o => {
				let b = new Boid( 0, 0, this.tank, o );
				b.angle = Math.random() * Math.PI * 2;		
				b.ScaleBoidByMass();
				return b;
			});
			this.tank.obstacles = scene.obstacles.map( x => new Rock(x) );
			this.tank.foods = scene.foods.map( x => new Food(x) );
			this.tank.plants = scene.plants.map( x => new Plant.PlantTypes[x.classname](x) );
		}
	}
	
}