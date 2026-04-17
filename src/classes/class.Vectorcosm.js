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
</AI> */

import Tank from '../classes/class.Tank.js'
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import Plant from '../classes/class.Plant.js'
import BoidLibrary from '../classes/class.BoidLibrary.js'
import TankLibrary from '../classes/class.TankLibrary.js'
import { SimulationFactory, NaturalTankSimulation } from '../classes/class.Simulation.js'
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
		this.max_foods = 400;
		this.plant_update_freq = 5;
		this.plant_update_next = 0;
		this.free_plant_growth = true;
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
		
		const w = params?.width || 1920;
		const h = params?.height || 1080;
		this.tank = new Tank( w, h );
		this.tank.MakeBackground();
		// if explicit pixel dimensions were given, prevent simulations from overriding them via volume-based resize
		this.lock_dimensions = !!params?.lock_dimensions;

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
		// meta params that carry over from sim to sim; apply any non-null overrides
		for ( const k in this.sim_meta_params ) {
			if ( this.sim_meta_params[k] !== null && this.sim_meta_params[k] !== undefined ) {
				this.simulation.settings[k] = this.sim_meta_params[k];
			}
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
		// plants don't do much frame to frame, so we can optimize by updating plants infrequently
		if ( this.plant_update_next <= this.simulation.stats.round_time || !this.simulation.stats.round_time ) {
			// schedule the next update
			this.plant_update_next = this.simulation.stats.round_time + this.plant_update_freq;
			
			// all plants ask for matter from the local background tank matter stat.
			// we need to keep track of which plants are asking for how much matter from which grid cell.
			// in cases where there isnt enough for everyone, restrict matter being granted.
			const requests_per_cell = {};
			const requests_per_plant = new Map();
			for ( let p of this.tank.plants ) {
				const request = p.RequestResources( this.plant_update_freq );
				if ( this.free_plant_growth ) {
					p.GrantResources( request );
				}
				else {
					const cell_index = this.tank.datagrid.CellIndexAt( p.x, p.y );
					if ( !( cell_index in requests_per_cell ) ) {
						requests_per_cell[cell_index] = request;
					}
					else {
						requests_per_cell[cell_index] += request;
					}
					requests_per_plant.set(p, [request,cell_index]);
				}
			}
			
			if ( !this.free_plant_growth ) {
				// convert the requested matter to a ratio of availability and
				// subtract the requested matter from the cell.
				for ( let cell_index in requests_per_cell ) {
					const avail = this.tank.datagrid.cells[cell_index].matter;
					const request = requests_per_cell[cell_index];
					const ratio = avail > 0 ? Math.min( avail / request, 1 ) : 0;
					requests_per_cell[cell_index] = ratio;
					if ( ratio ) {
						const amount = Math.min( request * ratio, avail );
						this.tank.datagrid.cells[cell_index].matter -= amount;
					}
				}
				
				// grant all plant requests 
				requests_per_plant.forEach( (v,p) => {
					const cell_index = v[1];
					const ratio = requests_per_cell[cell_index];
					const matter = v[0] * ratio;
					p.GrantResources( matter );
				} );
			}
			
			// update all plants ( fruit, death, etc )
			for ( let i = this.tank.plants.length-1; i >= 0; i-- ) {
				const plant = this.tank.plants[i];
				plant.Update(this.plant_update_freq); // NOTE: not the normal delta!
				if ( plant.dead ) {
					this.tank.plants.splice(i,1);
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
		this.sim_queue.push( new NaturalTankSimulation(settings) );
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
		this.tank.foods = scene.foods.map( x => new Food(x) );
		this.tank.plants = scene.plants.map( x => new Plant.PlantTypes[x.classname](x) );
	}
}
