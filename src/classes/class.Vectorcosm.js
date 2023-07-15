import neataptic from "neataptic";
import BodyPlan from '../classes/class.BodyPlan.js'
import Sensor from '../classes/class.Sensor.js'
import Two from "two.js";
// import * as Chart from "chart.js";
import Chart from 'chart.js/auto';
// you can optimize package size by not including everything. see:
// https://www.chartjs.org/docs/latest/getting-started/integration.html
import * as utils from '../util/utils.js'
import Tank from '../classes/class.Tank.js'
import { AvoidEdgesSimulation, TurningSimulation, FoodChaseSimulation, BasicTravelSimulation } from '../classes/class.Simulation.js'
import BrainGraph from '../classes/class.BrainGraph.js'
import { BoidFactory } from '../classes/class.Boids.js'

const { architect, Network } = neataptic;

export default class Vectorcosm {

	constructor() {
		// set up Two now, attach to DOM later
		this.two = new Two({ fitted: true, type: 'CanvasRenderer' });
		window.two = this.two; // make available everywhere

		this.simulation = null;
		this.tank = null;
		this.braingraph = null; // move me some day
		
		// world settings
		this.show_collision_detection = false;
		this.show_ui = true;
		this.show_brainmap = false;
		this.focus_object = null;
		this.focus_geo = null;
		this.fps = 0;
		this.width = 0;
		this.height = 0;
		this.scale = 1;
	}
	
	Init() {
				
		// set up Two
		let elem = document.getElementById('draw-shapes');
		this.two.appendTo(elem);
		// `types is one of: 'WebGLRenderer', 'SVGRenderer', 'CanvasRenderer'
		this.two.bind('update', (frameNumber, delta) => { this.update(frameNumber, delta); } );
		
		// default screen scaling based on user window
		if ( this.two.width < 500 ) { this.SetViewScale(0.4); }
		else if ( this.two.width < 1200 ) { this.SetViewScale(0.6); }
		else if ( this.two.width < 1900 ) { this.SetViewScale(1); }
		else { this.SetViewScale(1); }

		// set up tank
		this.tank = new Tank( this.width, this.height );
		this.tank.MakeBackground();
		this.sim_queue = [
			new FoodChaseSimulation(this.tank,{
				name: 'food chaser',
				num_boids: 70,
				time: 60,
				min_score: 5,
				max_mutation: 5,
				// num_foods: 3,
				// food_speed: 400,
				end: {
					// avg_score:400,
					// avg_score_rounds: 10,
					rounds:10000
				},
			}),	
		];
		
		
		this.sim_queue.forEach( sim => { sim.onComplete  = _ => this.LoadNextSim() } );
		
		this.LoadNextSim();
		
		// this.LoadStartingPopulationFromFile('./local/population-dart-ironman-chaser-30-2023-06-14.json');
		
		// draw screen
		this.two.update();
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
		if ( this.simulation ) { 
			console.log('next sim: ' + (this.simulation ? (this.simulation.settings.name||'unknown') : 'null') );
			this.simulation.Sterilize(); 
			this.simulation.tank.boids = boids;
			this.simulation.Setup(); 
			this.simulation.turbo = was_turbo;
			// [!]HACK
			if ( typeof(this.onSimulationChange) === 'function' ) {
				this.onSimulationChange(this.simulation);
			}
		}
		else { console.log("sim queue empty"); }
	}
	
	Play() {
		this.two.play();
	}

	// default scale depends on device you are on
	SetViewScale( scale ) {
		this.scale = utils.clamp( scale, 0.1, 10 );
		this.width =  two.width / this.scale,
		this.height =  two.height / this.scale,
		two.scene.scale = this.scale;
		if ( this.braingraph ) {
			this.braingraph.onScreenSizeChange();
		}
	}

	// use delta param to supply manual deltas for simulations.
	// otherwise it will use two.js's built in delta tracking.
	update(frameNumber, delta=0) {
		
		// fix delta supplied in ms
		if ( delta && delta > 1 ) { delta /= 1000; }
		delta = Math.min( (delta || this.two.timeDelta/1000), 0.25); // beware of spikes from pausing
		
		// update simulation		
		if ( this.simulation ) {
			this.simulation.Update(delta);
		}			
		
		// update all boids
		for ( let b of this.tank.boids ) {
			b.Update(delta);
		}
		
		// update food
		for ( let i = this.tank.foods.length-1; i >= 0; i-- ) {
			const food = this.tank.foods[i];
			food.Update(delta);
			if ( food.dead || !food.value ) {
				this.tank.foods.splice(i,1);
			}
		}
		
		// UI stats
		// this.simulator.framenum = two.frameCount;
		this.fps = Math.round(1/delta);
		
		// braingraph the leader
		this.DrawBrainGraph();
		
		// track any object that has focus
		if ( this.focus_object ) { this.TrackObject(this.focus_object); }
										
	}		

	DrawBrainGraph() {
		if ( this.show_brainmap && !this.simulation.turbo ) {
			// anything to track?
			if ( this.tank.boids.length ) {	
				let target = this.focus_object || this.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
				this.TrackObject(target);
				this.braingraph =  this.braingraph ?? new BrainGraph(target);
				this.braingraph.setTarget(target);
				this.braingraph.Draw();
			}
			// otherwise close
			else if ( this.braingraph ) {
				this.braingraph.Kill();
				this.braingraph = null;				
			}
		}
		else if ( this.braingraph ) {
			this.braingraph.Kill();
			this.braingraph = null;				
		}
	}
			
	TrackObject(o) {
		if ( !o ) { return; }
		if ( o.dead ) {
			if ( this.focus_object == o ) { this.StopTrackObject(); }
			return;
		}
		this.focus_object = o;
		if ( !this.focus_geo ) {
			this.focus_geo = this.two.makeCircle(this.focus_object.x, this.focus_object.y, 50);
			this.focus_geo.stroke = '#AEA';
			this.focus_geo.linewidth = 4;
			this.focus_geo.fill = 'transparent';
		}
		else {
			this.focus_geo.position.x = this.focus_object.x;
			this.focus_geo.position.y = this.focus_object.y;
		}
	}
	
	StopTrackObject() {
		if ( !this.focus_object ) { return ; }
		this.focus_object = null;
		if ( this.focus_geo ) {
			this.focus_geo.remove();
			this.focus_geo = null;
		}
	}
	
	ShiftFocusTarget( up = true ) {
		if ( !this.tank.boids.length ) { return; }
		if ( !this.focus_object ) { 
			this.TrackObject(this.tank.boids[0]);
		}
		else {
			let i = this.tank.boids.indexOf( this.focus_object );
			if ( i == -1 ) { i == 0; }
			else if ( !up || up <= 0 ) {
				if ( --i < 0 ) { i = this.tank.boids.length-1; }
			}
			else {
				if ( ++i == this.tank.boids.length ) { i = 0; }
			}
			console.log('tracking ' + i );
			this.TrackObject( this.tank.boids[i] );
		}
	}

	ChangeViewScale() {
		SetViewScale(this.scale);
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
		if ( this.simulation && this.simulation.turbo && this.simulation.stats.round.time <= this.simulation.settings.time ) {
			if ( this.two.playing ) { this.two.pause(); }
			for ( let n=0; n < 100; n++ ) {
				++this.two.frameCount; // fake it
				this.update( this.two.frameCount, 0.055 );
			}
			--this.two.frameCount;
			this.two.update();
			setTimeout( _ => this.RunSimulator(), 0 );
		}
		else {
			this.two.play();
		}
	}
	
	ToggleSimulatorFF() {
		if ( !this.simulation ) { return false; }
		this.simulation.turbo = !this.simulation.turbo;
		if ( this.simulation.turbo ) { this.RunSimulator(); }
	}
	TogglePause() {
		if ( this.two.playing ) { this.two.pause(); } 
		else { this.two.play(); }
	}
		
	SaveLeader() {
		if ( this.simulation.tank.boids.length ) {
			const b = this.simulation.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
			localStorage.setItem("leader-brain", JSON.stringify(b.brain.toJSON()));
			console.log("Saved leader brain with score " + b.total_fitness_score.toFixed(1) );
		}		
	}

	LoadLeader() {
		let json = localStorage.getItem("leader-brain");
		if (json) {
			json = JSON.parse(json);
			let brain = neataptic.Network.fromJSON(json);
			// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
			const b = BoidFactory(this.simulation.settings.species, this.width*0.25, this.height*0.25, this.simulation.tank );
			b.brain = brain;
			b.angle = Math.random() * Math.PI * 2;		
			this.simulation.tank.boids.push(b);				
			console.log("Spawned saved brain" );
		}		
	}
	
	SavePopulation() {
		if ( this.simulation.tank.boids.length ) {
			let jsons = [];
			for ( const b of this.simulation.tank.boids ) {
				jsons.push(b.brain.toJSON());
			}
			localStorage.setItem("population-brains", JSON.stringify(jsons));
			console.log("Saved population");
		}		
	}
			
	LoadPopulation() {
		let json = localStorage.getItem("population-brains");
		if (json) {
			json = JSON.parse(json);
			for ( let j of json ) {
				let brain = neataptic.Network.fromJSON(j);
				// const b = BoidFactory(world.use_species, Math.random()*world.width, Math.random()*world.height );
				const b = BoidFactory(this.simulation.settings.species, this.width*0.25, this.height*0.25, this.simulation.tank );
				b.brain = brain;
				b.angle = Math.random() * Math.PI * 2;		
				this.simulation.tank.boids.push(b);	
			}			
			console.log("Spawned saved population" );
		}		
	}
			
}