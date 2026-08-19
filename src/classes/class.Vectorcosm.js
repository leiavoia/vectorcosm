/* <AI>
Vectorcosm — worker-side root singleton. Lives at `globalThis.vc`.

OVERVIEW
- Owns the Tank, simulation queue, and all top-level game state inside the Web Worker.
- `Init(params)` — sets up the Tank and starts the sim queue. Called once on worker init.
- `next_object_id` — global sequential OID counter. Always increment via `++globalThis.vc.next_object_id`.
- `simulation` — current active Simulation instance.
- `tank` — single Tank instance for the session.
- `LoadNextSim()` — pops next Simulation from queue; restarts with a new sim when queue empties.

SIM QUEUE
- `sim_queue[]` holds Simulation instances to run in order.
- Subscribed to 'sim.complete' PubSub event → calls `LoadNextSim()`.

INIT PARAMS (all optional)
- `width`, `height` — tank size in pixels.
- `sim` — simulation preset name string (e.g. 'peaceful_tank'). Ignored if sim_queue is given.
- `sim_queue` — array of preset name strings to run in sequence.
- `sim_meta_params` — { num_boids, segments, rounds, ... } overrides applied to every sim.
- Direct sim settings: `num_boids`, `num_foods`, `num_plants`, `num_rocks`, `rounds`, `timeout`,
  `max_mutation`, `cullpct` — applied to sims built at init time ONLY (not sticky).
  These do NOT write to sim_meta_params. Use `sim_meta_params` block for sticky.
- `lock_dimensions` — prevent volume-based resize.

SIM META PARAMS (carry over across queue entries)
- All null by default. Any non-null value is applied to simulation.settings each time LoadNextSim() runs.
- Keys: num_boids, segments, rounds, num_foods, num_plants, num_rocks, timeout, max_mutation, cullpct.

SETTINGS
- `boid_sensors_every_frame` — run sensors on every frame (slow, for debugging).
- `plant_update_freq` — seconds between plant updates.
- `max_foods` — global food cap.

IMPORT/EXPORT
- `_ApplyTankScene(scene, settings)` — shared logic for LoadTank and ImportTank.
  Uses `SimulationFactory(settings)` so the original simtype (from scene.sim_settings.simtype) is restored.
  NaturalTankSimulation was previously hardcoded here — removed in Phase 4 to support experiment resume.
</AI> */

import Tank from '../classes/class.Tank.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import Plant from '../classes/class.Plant.js'
import BoidLibrary from '../classes/class.BoidLibrary.js'
import TankLibrary from '../classes/class.TankLibrary.js'
import { SimulationFactory } from '../classes/class.Simulation.js'
import { Boid } from '../classes/class.Boids.js'
import PubSub from 'pubsub-js'

export default class Vectorcosm {

	constructor() {
		// game objects
		this.next_object_id = 0; // sequential uuid for communicating with UI
		this.simulation = null;
		this.tank = null;
		
		// settings
		this.boid_sensors_every_frame = false;
		this.boid_snn_every_frame = false;
		this.lock_dimensions = false; // prevents volume-based resize when exact dimensions are requested.
		this.min_time_delta = 1/30;
		this.max_foods = 500;
		this.absolute_max_plants = 1000;
		this.plant_update_freq = 1; // needed to get "age" stats to tick up per second, but not technically required
		this.plant_update_next = this.plant_update_freq;
		this.obstacle_update_freq = 60;
		this.obstacle_update_next = 0;
		this.free_plant_growth = false;
		// carry-over settings applied to every simulation.settings when LoadNextSim() runs
		this.sim_meta_params = {
			num_boids: null,
			segments: null,
			rounds: null,
			num_foods: null,
			num_plants: null,
			num_rocks: null,
			timeout: null,
			max_mutation: null,
			cullpct: null,
		};
	}
	
	Init( params ) {
				
		// SET UP TANK -----------------\/-----------------
		
		const has_explicit_dimensions = params?.width !== undefined || params?.height !== undefined;
		const w = params?.width ?? 1920;
		const h = params?.height ?? 1080;
		this.tank = new Tank( w, h );
		this.tank.MakeBackground();
		// if the caller explicitly requested a size override, prevent simulations from overriding it via volume-based resize
		this.lock_dimensions = has_explicit_dimensions || !!params?.lock_dimensions;

		// DETECT SIMULATION SETTINGS & PARAMS ------------------\/-----------------
		
		// sim settings that carry over across all sims in the queue
		const SIM_SETTING_KEYS = ['num_boids','segments','rounds','num_foods','num_plants','num_rocks','timeout','max_mutation','cullpct'];

		// merge explicit sim_meta_params block if provided (sticky — carry over to all future sims)
		if ( params?.sim_meta_params ) {
			for ( const k of SIM_SETTING_KEYS ) {
				if ( k in params.sim_meta_params ) {
					// null explicitly clears a sticky override back to "not set"
					this.sim_meta_params[k] = params.sim_meta_params[k] !== undefined ? params.sim_meta_params[k] : null;
				}
			}
		}
		// flat sim settings from params (e.g. from URL) — applied to sims built at init time ONLY, not sticky
		const setting_overrides = {};
		for ( const k of SIM_SETTING_KEYS ) {
			if ( params?.[k] !== undefined ) {
				setting_overrides[k] = params[k];
				// deliberately NOT written to sim_meta_params — flat params don't persist beyond init
			}
		}

		// BUILD SIMULATION QUEUE -----------------\/------------
		
		// build simulation queue from params, or fall back to default.
		// overrides are applied after factory so the layering is: base_defaults → library_preset → user_overrides.
		// null override values are skipped (leave the library preset value in place).
		const buildSim = ( name_or_obj ) => {
			const sim = SimulationFactory(name_or_obj);
			for ( const [k, v] of Object.entries(setting_overrides) ) {
				if ( v !== null && v !== undefined ) { sim.settings[k] = v; }
			}
			return sim;
		};

		// explicit ordered queue of sim names / settings objects
		if ( params?.sim_queue?.length ) {
			this.sim_queue = params.sim_queue.map( buildSim );
		}
		// single named sim
		else if ( params?.sim ) {
			this.sim_queue = [ buildSim(params.sim) ];
		}
		// default
		else {
			this.sim_queue = [ buildSim('peaceful_tank') ];
		}
		
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
		let boids = this.simulation ? this.tank.boids.splice(0,this.tank.boids.length) : [];
		// start the next simulation; default to natural tank if queue is empty
		this.simulation = this.sim_queue.shift();
		if ( !this.simulation ) { 
			this.simulation = SimulationFactory('natural_tank');
		}
		// meta params that carry over from sim to sim; apply any non-null, non-zero overrides.
		// 0 is the UI sentinel for "use default" (sliders rest at 0 meaning "not set").
		// segments minimum is 1, so <= 1 means "not set".
		for ( const k in this.sim_meta_params ) {
			const v = this.sim_meta_params[k];
			if ( v === null || v === undefined || v === 0 ) { continue; }
			if ( k === 'segments' && v <= 1 ) { continue; }
			this.simulation.settings[k] = v;
		}
		// clean the tank and transplant boids back in
		this.tank.Kill();
		this.tank.boids = boids;
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
		for ( let p of this.tank.plants ) { this.tank.grid.Add(p); }
		
		// update all boids
		for ( let i = this.tank.boids.length-1; i >= 0; i-- ) {
			const b = this.tank.boids[i];
			b.Update(delta);
			if ( b.dead ) {
				this.tank.boids.splice(i,1);
			}
		}
		
		// update plants
		// plants don't do much frame to frame, so we can optimize by updating plants infrequently
		// NOTE: if simulation resets, we have a timestamp problem. detect and correct.
		if ( this.plant_update_next <= this.simulation.stats.round_time - this.plant_update_freq * 2 ) {
			this.plant_update_next = this.simulation.stats.round_time + this.plant_update_freq;
		}
		if ( this.plant_update_next <= this.simulation.stats.round_time || !this.simulation.stats.round_time ) {
			// schedule the next update
			this.plant_update_next = this.simulation.stats.round_time + this.plant_update_freq;
			// update all plants ( fruit, death, etc )
			// attempt to grow all plants. plants grow on a first come first served basis. 
			// there may not be enough for everyone. to make it fair, we randomize the order of growth each update.
			this.tank.plants.shuffle(); // may have unknown side effects on iteration
			for ( let i = this.tank.plants.length-1; i >= 0; i-- ) {
				const plant = this.tank.plants[i];
				plant.Update(this.plant_update_freq); // NOTE: not the normal delta!
				if ( plant.dead ) {
					this.tank.plants.splice(i,1);
				}
			}
		}
		
		// update rocks / obstacles
		// NOTE: rocks generally dont need updates, but some are actually rotting stumps
		// NOTE: if simulation resets, we have a timestamp problem. detect and correct.
		if ( this.obstacle_update_next <= this.simulation.stats.round_time - this.obstacle_update_freq * 2 ) {
			this.obstacle_update_next = this.simulation.stats.round_time + this.obstacle_update_freq;
		}		
		if ( this.obstacle_update_next <= this.simulation.stats.round_time || !this.simulation.stats.round_time ) {
			// schedule the next update
			this.obstacle_update_next = this.simulation.stats.round_time + this.obstacle_update_freq;
			// update all obstacles
			for ( let i = this.tank.obstacles.length-1; i >= 0; i-- ) {
				const obstacle = this.tank.obstacles[i];
				obstacle.Update(this.obstacle_update_freq); // NOTE: not the normal delta!
				if ( obstacle.dead ) {
					this.tank.obstacles.splice(i,1);
				}
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

	async SavePopulation( species=null, ids=null, to_db=false ) {
		if ( this.tank.boids.length ) {
			let list = this.tank.boids;
			if ( species ) {
				if ( Array.isArray(species) ) {
					list = list.filter( x => species.includes(x.species) );
				} else {
					list = list.filter( x => x.species == species );
				}
			}
			if ( ids ) {
				if ( !Array.isArray(ids) ) { ids = [ids]; }
				list = list.filter( x => ids.includes(x.oid) );
			}
			// save to database
			if ( to_db ) {
				const lib = new BoidLibrary();
				await lib.Add( list ); // label auto-generated
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
				let b = new Boid( 0, 0, j );
				b.ScaleBoidByMass();
				this.simulation.AddBoidToTank(b); // handles safe spawn
			}			
		}		
	}
	
	// id: 
	//	null creates a new record
	// 	zero is used as the "buffer" slot
	//	>0 for library slots
	async SaveTank( id=0 ) {
		if ( this.tank ) {
			let tank = this.tank;
			let w = Math.round(tank.width);
			let h = Math.round(tank.height);
			let num_boids = tank.boids.length;
			let num_plants = tank.plants.length;
			let num_rocks = tank.obstacles.length;
			let num_foods = tank.foods.length;
			let age = Math.round(this.simulation?.stats?.round_time || 0);
			let label = `${w}x${h}, ${num_boids} Boids, ${num_plants} Plants, ${num_rocks} Rocks`;
			const scene = {
				tank: tank.Export(),
				boids: tank.boids.map( x => x.Export() ),
				obstacles: tank.obstacles.map( x => x.Export() ),
				foods: tank.foods.map( x => x.Export() ),
				plants: tank.plants.map( x => x.Export() ),
				sim_settings: this.simulation.settings,
			};
			const meta = { width: w, height: h, num_boids, num_plants, num_rocks, num_foods, age };
			const lib = new TankLibrary();
			let new_id;
			if ( id !== null ) {
				// id=0 is the buffer slot, id>0 saves over existing library entry
				new_id = await lib.Save( id, scene, label, meta );
			} 
			else {
				new_id = await lib.Add( scene, label, meta );
			}
			let date = Date.now();
			return { id: new_id, label, date };
		}
	}
	
	async LoadTank( id=0, settings=null ) {
		if ( id >= 0 ) {
			const lib = new TankLibrary();
			const data = await lib.GetData(id);
			if ( !data ) { return null; }
			const scene = data.scene;
			this._ApplyTankScene(scene, settings);
		}
	}

	// Load a tank from a plain scene object (no DB). Used by the import_tank worker command.
	ImportTank( scene, settings=null ) {
		if ( !scene || !scene.tank ) { return false; }
		this._ApplyTankScene(scene, settings);
		return true;
	}

	// Shared scene-application logic for LoadTank and ImportTank
	_ApplyTankScene( scene, settings=null ) {
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
		// use simtype from saved settings if present so the original simulation type is preserved
		this.sim_queue.push( SimulationFactory(settings) );
		// lock dimensions so Simulation.Setup() cannot resize the loaded tank via volume
		this.lock_dimensions = true;
		this.LoadNextSim();
		this.lock_dimensions = false;
		this.tank.boids = scene.boids.map( o => {
			let b = new Boid( 0, 0, o );
			b.angle = Math.random() * Math.PI * 2;		
			b.ScaleBoidByMass();
			return b;
		});
		this.tank.obstacles = scene.obstacles.map( x => new Rock(x) );
		// recalculate light/heat with the restored rock layout
		this.tank.RecalcEnvironment();
		this.tank.FindSafeZones();
		this.tank.foods = scene.foods.map( x => new Food(x) );
		this.tank.plants = scene.plants.map( x => new Plant(x) );
	}
}
