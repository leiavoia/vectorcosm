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
import Rock from '../classes/class.Rock.js'
import Food from '../classes/class.Food.js'
import Plant from '../classes/class.Plant.js'
import { AvoidEdgesSimulation, TurningSimulation, FoodChaseSimulation, BasicTravelSimulation } from '../classes/class.Simulation.js'
import BrainGraph from '../classes/class.BrainGraph.js'
import { BoidFactory, Boid } from '../classes/class.Boids.js'
import PubSub from 'pubsub-js'
import * as TWEEN from '@tweenjs/tween.js'

export default class Vectorcosm {

	constructor() {
		// set up Two now, attach to DOM later
		// WebGLRenderer: fastest if hardware acceleration available
		// SVGRenderer: fast on newer browsers with accelerated SVG rendering. Also allows SVG scene export.
		// CanvasRenderer: faster on older machines, slower on newer machines
		this.two = new Two({ fitted: true, type: 'SVGRenderer' }); 
		window.two = this.two; // make available everywhere
		this.renderLayers = {};
		this.renderLayers['backdrop'] = this.two.makeGroup(); // parallax backdrop needs to stay separate from tank
		this.renderLayers['tank'] = this.two.makeGroup(); // meta group. UI and tank layers need to scale separately
		this.renderLayers['-2'] = this.two.makeGroup(); // tank backdrop
		this.renderLayers['-1'] = this.two.makeGroup(); // background objects
		this.renderLayers['0'] = this.two.makeGroup(); // middle for most objects / default
		this.renderLayers['1'] = this.two.makeGroup(); // foregrounds objects
		this.renderLayers['2'] = this.two.makeGroup(); // very near objects
		this.renderLayers['ui'] = this.two.makeGroup(); // UI layer - stays separate from the others
		this.renderLayers['tank'].add(this.renderLayers['-2']);
		this.renderLayers['tank'].add(this.renderLayers['-1']);
		this.renderLayers['tank'].add(this.renderLayers['0']);
		this.renderLayers['tank'].add(this.renderLayers['1']);
		this.renderLayers['tank'].add(this.renderLayers['2']);
		
		this.simulation = null;
		this.tank = null;
		this.braingraph = null; // move me some day
		
		// world settings
		this.animate_boids = true;
		this.animate_plants = true;
		this.plant_intro_method = 'grow'; // 'grow' or 'fade'
		this.plant_growth_animation_step = 0.05; // in seconds. reduces the number of geometry updates
		this.show_collision_detection = false;
		this.show_ui = false;
		this.show_brainmap = false;
		this.boid_sensors_every_frame = false;
		this.responsive_tank_size = false;
		this.allow_hyperzoom = true;
		this.focus_object = null;
		this.focus_geo = null;
		this.fps = 0;
		this.width = 0;
		this.height = 0;
		this.scale = 1;
		this.camera = {
			x: 0,
			y: 0,
			z: 1,
			xmin:0, // box used to determine if stuff is in view
			ymin:0,
			xmax:0,
			ymax:0,
			min_zoom: 0.1,
			max_zoom: 2,
			cinema_mode: false,
			tween: null,
			cinema_timeout: null,
			easing: TWEEN.Easing.Sinusoidal.InOut, // SEE: https://github.com/tweenjs/tween.js/blob/main/docs/user_guide.md
			transitions: false,
			parallax: false,
			transition_time: 10000, // ms
			focus_time: 15000, // ms
			show_boid_indicator_on_focus: true,
			show_boid_info_on_focus: true,
			show_boid_sensors_on_focus: true,
			show_boid_collision_on_focus: false,
			animation_min: 0.4 // zoom level beyond which we stop animating
		};
		
		// subscriptions to critical events
		// this.frameUpdateSubscription = PubSub.subscribe('frame-update', (msg,data) => {
    	// 	console.log( msg, data );
		// });
		
	}
	
	Init() {
				
		// set up Two
		let elem = document.getElementById('draw-shapes');
		this.two.appendTo(elem);
		// `types is one of: 'WebGLRenderer', 'SVGRenderer', 'CanvasRenderer'
		this.two.bind('update', (frameNumber, delta) => { this.update(frameNumber, delta); } );
		this.SetViewScale(1);
		
		// set up tank
		this.tank = new Tank( this.width, this.height );
		this.tank.MakeBackground();
		
		// default screen scaling based on user window
		if ( this.two.width < 500 ) { this.SetViewScale(0.4); }
		else if ( this.two.width < 1200 ) { this.SetViewScale(0.6); }
		else if ( this.two.width < 1900 ) { this.SetViewScale(1); }
		else { this.SetViewScale(1); }
		this.ResizeTankToWindow(true); // force
		this.ResetCameraZoom();
		
		const food_training_sim_easy = new FoodChaseSimulation(this.tank,{
			name: 'Food Chase - Easy',
			num_boids: 50,
			// random_boid_pos: true,
			// random_food_pos: true,
			time: 20,
			// min_score: 5,
			max_mutation: 0.1,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 1.5,
			angle_spread: 0.2,
			current: 0,
			num_foods: 1,
			food_speed: 70,
			food_bounce_margin: 300,
			food_friction: false,
			food_value:2000,
			end: {
				avg_score:500,
				avg_score_rounds: 10,
				rounds:200
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});		
		
		const food_training_sim_medium = new FoodChaseSimulation(this.tank,{
			name: 'Food Chase - Medium',
			num_boids: 80,
			// random_boid_pos: true,
			// random_food_pos: true,
			time: 45,
			// min_score: 5,
			max_mutation: 0.1,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 0.7,
			angle_spread: 0.2,
			current: 0,
			num_foods: 2,
			food_speed: 125,
			food_bounce_margin: 300,
			food_friction: false,
			food_value:2000,
			end: {
				avg_score:500,
				avg_score_rounds: 10,
				rounds:500
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
		});		
		
		const food_training_sim_hard = new FoodChaseSimulation(this.tank,{
			name: 'Food Chase - Hard',
			num_boids: 60,
			// random_boid_pos: true,
			// random_food_pos: true,
			time: 80,
			// min_score: 5,
			max_mutation: 0.1,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 0.6,
			angle_spread: 0.2,
			current: 0,
			num_foods: 3,
			food_speed: 400,
			food_bounce_margin: 300,
			food_friction: false,
			food_value:2000,
			end: {
				avg_score:600,
				avg_score_rounds: 10,
				rounds:500
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});		
		
		const food_training_sim_forever = new FoodChaseSimulation(this.tank,{
			name: 'Food Chase - Forever',
			num_boids: 80,
			// random_boid_pos: true,
			// random_food_pos: true,
			time: 80,
			// min_score: 5,
			max_mutation: 0.12,
			// you can separately define DNA and brain mutations, in case you want just one or the other
			// dna_mutation_rate: 0.1,
			// brain_mutation_rate: 0.1,
			num_rocks: 0,
			num_plants: 0,
			target_spread: 200,
			species:'random',
			cullpct: 0.4,
			edibility: 1,
			scale: 0.6,
			angle_spread: 0.2,
			current: 0,
			num_foods: 3,
			food_speed: 200,
			food_bounce_margin: 300,
			food_friction: false,
			food_value:2000,
			end: {
				rounds:10000
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});		
		
		const edge_training = new AvoidEdgesSimulation(this.tank,{
			name: 'Obstacle Course',
			num_boids: 60,
			time: 20,
			punishment: 0.05,
			max_segment_spread: 70,
			segments: 7,
			max_mutation: 0.1,
			num_rocks: 2,
			angle_spread: 0.3,
			food_proximity_bonus: 100,
			tunnel: true,
			// spiral:true,
			end: {
				// avg_score:400,
				// avg_score_rounds: 10,
				rounds:10000
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true
		});
		
		const turning_training_easy = new TurningSimulation(this.tank,{
			name: 'Steering - Easy',
			num_boids: 100,
			num_foods: 1,
			time: 1.6,
			max_mutation: 0.5,
			brain_mutation_rate: 0.25,
			angle_spread: 0.7, // radians
			cullpct: 0.5,
			distance: 500,
			scale:0.5,
			distance_variance: 0.4,
			end: {
				avg_score:90,
				avg_score_rounds: 7,
				rounds:200
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true,
			edibility: 1
		});
		const turning_training_medium = new TurningSimulation(this.tank,{
			name: 'Steering - Medium',
			num_boids: 100,
			num_foods: 2,
			time: 5,
			max_mutation: 0.2,
			brain_mutation_rate: 0.25,
			angle_spread: 1.0, // radians
			cullpct: 0.3,
			distance: 500,
			scale:0.45,
			distance_variance: 0.3,
			end: {
				avg_score:88,
				avg_score_rounds: 10,
				rounds:100
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true,
			edibility: 1
		});
		const turning_training_hard = new TurningSimulation(this.tank,{
			name: 'Steering - Hard',
			num_boids: 100,
			num_foods: 5,
			time: 16,
			num_rocks:1,
			max_mutation: 0.2,
			brain_mutation_rate: 0.25,
			angle_spread: 1, // radians
			cullpct: 0.3,
			distance: 450,
			scale:0.25,
			distance_variance: 0.2,
			end: {
				avg_score:88,
				avg_score_rounds: 7,
				rounds:120
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true,
			edibility: 1
		});
		const turning_training_xhard = new TurningSimulation(this.tank,{
			name: 'Steering - Extra Hard',
			num_boids: 100,
			num_foods: 5,
			num_rocks: 5,
			time: 20,
			max_mutation: 0.2,
			brain_mutation_rate: 0.25,
			angle_spread: 1, // radians
			cullpct: 0.3,
			distance: 450,
			scale:0.25,
			distance_variance: 0.2,
			end: {
				avg_score:86,
				avg_score_rounds: 7,
				rounds:150
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true,
			edibility: 1
		});
		const treasure_hunt_training = new FoodChaseSimulation(this.tank,{
			name: 'Treasure Hunt',
			num_boids: 60,
			num_foods: 25,
			num_rocks: 8,
			time: 120,
			max_mutation: 0.3,
			cullpct: 0.2,
			scale:0.3,
			end: {
				avg_score:86,
				avg_score_rounds: 7,
				rounds:150
			},
			poop:false,
			ignore_other_boids:true,
			sterile:true,
			on_bite_ignore:true,
			target_spread: 0,
			edibility: 1,
			permafood:true,
			food_speed: 0.00001,
			random_food_pos: true,
			food_bounce_margin: 100,
			food_friction: true,
			food_value:1000,
			end: {
				// avg_score:600,
				// avg_score_rounds: 10,
				rounds:150
			}
		});
		
		const natural_tank = new FoodChaseSimulation(this.tank,{
			name: 'Natural Tank',
			num_boids: 60,
			random_boid_pos: true,
			random_food_pos: true,
			time: 1000000,
			// min_score: 5,
			max_mutation: 0.2,
			num_rocks: 3,
			num_plants: 10,
			target_spread: 400,
			species:'random',
			cullpct: 0.3,
			edibility: 1,
			scale: 0.5,
			// angle_spread: 0.2,
			current: 0.1,
			num_foods: 0,
			food_friction: true,
			tide: 600,
			add_decor: 0.75,
			random_boid_angle: true,
			// speciation_rate: 0.001
			allow_speciation: true
		});		
				
		const pitri_dish = new FoodChaseSimulation(this.tank,{
			name: 'Pitri Dish',
			num_boids: 1,
			random_boid_pos: true,
			random_food_pos: true,
			time: 1000000,
			// min_score: 5,
			max_mutation: 0,
			num_rocks: 0,
			num_plants: 0,
			edibility: 1,
			scale: 1.3,
			current: 0,
			num_foods: 1,
			food_speed: 0,
			food_bounce_margin: 200,
			food_friction: false,
			food_value:1000,
			poop:true,
			ignore_other_boids:false,
			sterile:false
		});			
					
		// set up simulations so we have something to watch
		this.sim_queue = [
			// turning_training_easy,
			// turning_training_medium,
			// turning_training_hard,
			// turning_training_xhard,
			// treasure_hunt_training,
			// food_training_sim_easy,
			// food_training_sim_medium,
			// food_training_sim_hard,
			// food_training_sim_forever,
			// edge_training
			natural_tank,
			// pitri_dish
		];
		
		this.LoadNextSim();
		
		// this.LoadStartingPopulationFromFile('./local/population-dart-ironman-chaser-30-2023-06-14.json');
		
		// draw screen
		this.two.update();
		
	}

	// TODO: this is all technically UI related stuff that should be moved out of the simulation code.
	// the camera has a hard to accessing and affecting the UI, such as boid info window.
	CinemaMode( x=true ) { 
		this.camera.cinema_mode = !!x;
		if ( x ) {
			this.StopTrackObject();
			if ( this.camera.tween ) {
				this.camera.tween.stop();
				this.camera.tween = null;
			}
			// random chance to do a few basic options
			const r = Math.random();
			// focus on a boid
			if ( r < 0.3 && this.tank.boids.length ) {
				// pick a boid and chase it down
				const b = this.tank.boids.pickRandom();
				const zoom = utils.BiasedRand( 
					this.camera.min_zoom,
					this.camera.max_zoom,
					this.camera.min_zoom + (this.camera.max_zoom - this.camera.min_zoom) / 3, // div by three to shift towards zoomed out
					0.5 
					);
				if ( this.camera.transitions ) {
					const to = { x: b.x, y: b.y, z: zoom };
					this.camera.tween = new TWEEN.Tween(this.camera)
						.to(to, this.camera.transition_time )
						.easing(this.camera.easing)
						.dynamic(true)
						.onUpdate( obj => {
							if ( !b || b.dead ) { 
								this.camera.tween.stop();
								this.camera.tween = null;
								this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), 2500 ); 		
							}
							else {
								to.x = b.x;
								to.y = b.y;
								this.PointCameraAt( this.camera.x, this.camera.y, this.camera.z );
							}
						})
						// switch to absolute tracking after chase completed
						.onComplete( obj => {
							this.TrackObject(b);
							this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time ); 			
						})
						.start();
				}
				else {
					this.PointCameraAt( b.x, b.y, zoom );
					this.TrackObject(b);
					this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time );
				}
			}
			// focus on a point of interest
			else if ( r < 0.85 ) {
				// zoom setup
				let zoom = this.camera.z;
				// if transitions are enabled, reduce zoom changes to preserve frame rate and viewer sanity
				let zoom_change_chance = this.camera.transitions ? 0.2 : 0.65;
				// when changing zoom, pick from the larger perspective most of the time
				if ( Math.random() < zoom_change_chance ) {
					zoom = utils.RandomFloat( this.camera.min_zoom, this.camera.max_zoom );
					zoom = utils.shapeNumber( zoom, this.camera.min_zoom, this.camera.max_zoom, 0.25, 3 );
				}
				const roll = Math.random();
				// random point in space to fall back on if nothing is in tank
				let target_x = this.tank.width * Math.random();
				let target_y = this.tank.height * Math.random();
				// rock
				if ( this.tank.obstacles.length && roll < 0.25 ) {
					const obj = this.tank.obstacles.pickRandom();
					// pick a point on the hull, not on the interior
					const pt = obj.collision.hull.pickRandom();
					target_x = pt[0];
					target_y = pt[1];
				}
				// plant
				else if ( this.tank.plants.length && roll < 0.5 ) {
					const obj = this.tank.plants.pickRandom();
					// pick a point near but slightly above the base
					target_x = obj.x;
					target_y = obj.y - 200;
				}
				// boid
				else if ( this.tank.boids.length && roll < 0.90 ) {
					const obj = this.tank.boids.pickRandom();
					target_x = obj.x;
					target_y = obj.y;
				}
				// food particle
				else if ( this.tank.foods.length ) {
					const obj = this.tank.foods.pickRandom();
					target_x = obj.x;
					target_y = obj.y;
				}
				// adjust point to sit inside a margin to avoid pan/zoom jank
				const margin_x = ( this.width / 2 ) / zoom;
				const margin_y = ( this.height / 2 ) / zoom;
				target_x = utils.Clamp( target_x, margin_x, this.tank.width - margin_x );
				target_y = utils.Clamp( target_y, margin_y, this.tank.height - margin_y );
				if ( this.camera.transitions ) {
					this.camera.tween = new TWEEN.Tween(this.camera)
						.to({
							x: target_x, 
							y: target_y,
							z: zoom
						}, this.camera.transition_time )
						.easing(TWEEN.Easing.Sinusoidal.InOut)
						.onUpdate( obj => {
							this.PointCameraAt( this.camera.x, this.camera.y, this.camera.z );
						})
						.onComplete( obj => {
							this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time );
						})
						.start();
				}
				else {
					this.PointCameraAt( target_x, target_y, zoom );
					this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time );
				}
			}
			// whole scene
			else {
				if ( this.camera.transitions ) {
					this.camera.tween = new TWEEN.Tween(this.camera)
						.to({
							x: this.tank.width/2, 
							y: this.tank.height/2,
							z: this.camera.min_zoom
						}, this.camera.transition_time )
						.easing(TWEEN.Easing.Sinusoidal.InOut)
						.onUpdate( obj => {
							this.PointCameraAt( this.camera.x, this.camera.y, this.camera.z );
						})
						.onComplete( obj => {
							this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time ); 			
						})
						.start();			
				}
				else {
					this.ResetCameraZoom();
					this.camera.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.camera.focus_time );
				}
			}
		}
		else {
			if ( this.camera.cinema_timeout ) {
				clearTimeout(this.camera.cinema_timeout);
				this.camera.cinema_timeout = null;
			}
			if ( this.camera.tween ) {
				this.camera.tween.stop();
				this.camera.tween = null;
			}
			this.StopTrackObject();
		}
	}
	
	ResetCameraZoom() {
		const scalex = this.width / this.tank.width;
		const scaley = this.height / this.tank.height;
		const scale = Math.min(scalex,scaley); // min = contain, max = cover
		this.camera.min_zoom = scale;
		// this.camera.max_zoom = 2; // Math.min(this.tank.width,this.tank.height) / 1250;
		this.PointCameraAt( this.tank.width*0.5, this.tank.height*0.5, scale );	
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
			this.simulation = new FoodChaseSimulation(this.tank,{
				name: 'Natural Tank',
				num_boids: (boids.length || 20),
				random_boid_pos: true,
				random_food_pos: true,
				time: 10000000,
				max_mutation: 0.1,
				num_rocks: 5,
				num_plants: 10,
				cullpct: 0,
				scale: 0.5,
				current: 0.1,
				num_foods: 0,
				food_friction: true,
				tide: 600,
				add_decor: 0.75,
			});		
		}
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
		this.two.play();
	}

	SetViewScale( scale ) {
		const prev_scale = this.renderLayers['tank'].scale;
		this.width = two.width;
		this.height = two.height;
		this.scale = utils.clamp( scale, 0.01, 5 );
		this.renderLayers['tank'].scale = this.scale;
		// small adjustment to keep screen centered
		const xdiff = ( this.width * prev_scale ) - ( this.width * this.scale );
		this.renderLayers['tank'].position.x += xdiff * 0.5;
		const ydiff = ( this.height * prev_scale ) - ( this.height * this.scale );
		this.renderLayers['tank'].position.y += ydiff * 0.5;
		if ( this.braingraph ) {
			this.braingraph.onScreenSizeChange();
		}
	}
	
	// if force is FALSE, `responsive_tank_size` setting will be honored
	ResizeTankToWindow( force=false ) {
		if ( this.tank ) {
			if ( this.responsive_tank_size || force ) {
				this.tank.Resize(this.width / this.scale, this.height / this.scale);
				this.renderLayers['tank'].position.x = 0;
				this.renderLayers['tank'].position.y = 0;
				this.camera.min_zoom = Math.min(this.width / this.tank.width, this.height / this.tank.height);
			}
			else { 
				this.tank.ScaleBackground(); 
			}
		}
	}

	// use delta param to supply manual deltas for simulations.
	// otherwise it will use two.js's built in delta tracking.
	update(frameNumber, delta=0) {
		
		// fix delta supplied in ms
		if ( delta && delta > 1 ) { delta /= 1000; }
		
		// UI stats - reports ACTUAL FPS - not rectified
		this.fps = Math.round(1/delta);
				
		// 20 FPS minimum. beware of spikes from pausing
		delta = Math.min( (delta || this.two.timeDelta/1000), 0.05); 
		
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
		for ( let b of this.tank.boids ) { this.tank.grid.Add(b); }
		for ( let o of this.tank.obstacles ) { this.tank.grid.Add(o); }
		for ( let f of this.tank.foods ) { this.tank.grid.Add(f); }
		
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
		
		// braingraph the leader
		this.DrawBrainGraph();
		
		// track any object that has focus
		if ( this.focus_object ) { this.TrackObject(this.focus_object); }
		
		// tweening - mostly for camera movement
		TWEEN.update( /* requires absolute time. deltas dont work */ );
		
		PubSub.publish('frame-update', 'hello world!');
		// PubSub.publishSync('frame-update', 'hello world!');
										
	}		

	AddShapeToRenderLayer( geo, layer='0' ) {
		try {
			this.renderLayers[layer].add(geo);
		}
		catch (error) {
			console.warn('no drawing layer named ' + layer);
		}
	}
	
	DrawBrainGraph() {
		if ( this.show_brainmap && !this.simulation.turbo ) {
			// anything to track?
			if ( this.tank.boids.length ) {	
				let target = this.focus_object || this.tank.boids.sort( (a,b) => b.total_fitness_score - a.total_fitness_score )[0];
				this.TrackObject(target);
				this.braingraph =  this.braingraph ?? new BrainGraph(target, this.two);
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
		o.show_sensors = this.camera.show_boid_sensors_on_focus;
		o.DrawBounds(this.camera.show_boid_collision_on_focus);
		if ( this.focus_object && this.focus_object !== o ) { 
			delete this.focus_object.show_sensors;
			this.focus_object.DrawBounds(false);
		}
		this.focus_object = o;
		if ( !this.focus_geo ) {
			const focus_radius = 80
			this.focus_geo = this.two.makeCircle(this.focus_object.x, this.focus_object.y, focus_radius);
			this.focus_geo.stroke = '#AEA';
			this.focus_geo.linewidth = 3;
			this.focus_geo.fill = 'transparent';
			
			// const grad = window.two.makeRadialGradient(0, 0, focus_radius, 
			// 	new Two.Stop(0,'transparent'), 
			// 	new Two.Stop(0.8,'#AAEEAA00'), 
			// 	new Two.Stop(1,'#AAEEAAAA')
			// );
			// grad.units = 'userSpaceOnUse'; // super important
			// this.focus_geo.stroke = 'transparent';
			// this.focus_geo.linewidth = 0;
			// this.focus_geo.fill = grad;
			
			this.focus_geo.visible = this.camera.show_boid_indicator_on_focus;
			this.AddShapeToRenderLayer(this.focus_geo);
		}
		else {
			this.focus_geo.position.x = this.focus_object.x;
			this.focus_geo.position.y = this.focus_object.y;
			this.PointCameraAt( this.focus_object.x, this.focus_object.y );
		}
		// this.focus_object.DrawBounds();
	}
	
	StopTrackObject() {
		if ( !this.focus_object ) { return ; }
		delete this.focus_object.show_sensors;
		this.focus_object.DrawBounds(false);
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
			this.TrackObject( this.tank.boids[i] );
		}
	}

	// put camera at a specific point in world space / zoom
	PointCameraAt( x, y, z=null ) {
		// entire tank is smaller than screen - snap to center
		if ( !this.allow_hyperzoom && z && z * this.tank.width < this.width && z * this.tank.height < this.height ) { 
			const scalex = this.width / this.tank.width;
			const scaley = this.height / this.tank.height;
			const scale = Math.min(scalex,scaley); // min = contain, max = cover
			x = this.tank.width * 0.5;
			y = this.tank.height * 0.5;
			if ( !this.allow_hyperzoom ) { z = scale; }
			}
		
		// zoom
		if ( z && z!=this.scale ) { 
			z = Math.min( z, this.camera.max_zoom );
			this.SetViewScale( z ); 
		}
		
		// X pos	
		const target_x = -( x * this.scale ) + ( 0.5 * this.width );
		const max_x = -0.0001 + (this.tank.width * this.scale) - (this.width);
		if ( this.scale * this.tank.width < this.width && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.x = -max_x / 2; }
		else if ( target_x > 0 && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.x = 0; }  
		else if ( target_x < -max_x && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.x = -max_x; }  
		else { this.renderLayers['tank'].position.x = target_x; }
		
		// Y pos
		const target_y = -( y * this.scale ) + ( 0.5 * this.height );
		const max_y = -0.0001 + (this.tank.height * this.scale) - (this.height);
		if ( this.scale * this.tank.height < this.height && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.y = -max_y / 2; }
		else if ( target_y > 0 && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.y = 0; }  
		else if ( target_y < -max_y && !this.allow_hyperzoom ) { this.renderLayers['tank'].position.y = -max_y; }
		else { this.renderLayers['tank'].position.y = target_y; }
		
		// record stats
		[ this.camera.x, this.camera.y ] = this.ScreenToWorldCoord( this.width * 0.5, this.height * 0.5 );
		[ this.camera.xmin, this.camera.ymin ] = this.ScreenToWorldCoord( 0, 0 );
		[ this.camera.xmax, this.camera.ymax ] = this.ScreenToWorldCoord( this.width, this.height );
		this.camera.z = this.scale;	
		
		this.AdjustBackgroundForParallax();
	}
	
	// for adjusting camera position in smaller increments.
	// x and y are SCREEN pixel units
	// z is the absolute zoom diff (not a percentage)
	MoveCamera( x, y, z=null ) {
		this.PointCameraAt( 
			this.camera.x + ( x / this.camera.z ), 
			this.camera.y + ( y / this.camera.z ), 
			this.camera.z + (z||0)
		);
	}
	
	AdjustBackgroundForParallax() {
		// static background provides faux parallax
		if ( !this.camera.parallax ) { return; }
		// true parallax
		const margin = 0.0001;
		const max_x = -margin + (this.tank.width * this.scale) - (this.width);
		const max_y = -margin + (this.tank.height * this.scale) - (this.height);
		const scalex = this.width / this.tank.width;
		const scaley = this.height / this.tank.height;
		const minscale = Math.min(scalex,scaley); // min = contain, max = cover
		const bgscale = this.renderLayers['tank'].scale /  minscale;
		if ( bgscale != this.renderLayers['backdrop'].scale ) { // optimization to dodge setScale()
			this.renderLayers['backdrop'].scale = bgscale;
		}
		const xpct = -utils.Clamp( this.renderLayers['tank'].position.x / max_x, -1, 1);
		const ypct = -utils.Clamp( this.renderLayers['tank'].position.y / max_y, -1, 1);
		const xrange = this.width * (this.renderLayers['backdrop'].scale - 1);
		const yrange = this.height * (this.renderLayers['backdrop'].scale - 1);
		this.renderLayers['backdrop'].position.x = -(xpct * (xrange/2)) - (xrange/4);
		this.renderLayers['backdrop'].position.y = -(ypct * (yrange/2)) - (yrange/4);
		// console.log(
		// 	this.renderLayers['tank'].position.x,
		// 	this.renderLayers['tank'].position.y,
		// 	this.renderLayers['backdrop'].position.x,
		// 	this.renderLayers['backdrop'].position.y
		// );
		// adjustment for hyperzoomed situations
		if ( this.renderLayers['tank'].position.x > 0 || this.renderLayers['tank'].position.y > 0 ) {
			// if ( this.tank.bg ) { 
			// 	this.renderLayers['backdrop'].scale = 1;
			// 	let rect = this.renderLayers['backdrop'].getBoundingClientRect(true);
			// 	// console.log(rect.width, this.tank.width);
			// 	// this.tank.bg.remove();
			// 	// this.renderLayers['backdrop'].add(this.tank.bg);
			// 	this.renderLayers['backdrop'].scale = new Two.Vector( 
			// 		this.tank.width / rect.width,
			// 		this.tank.height / rect.height 
			// 	);
			// }
			// this.tank.ScaleBackground();
			this.renderLayers['backdrop'].position.x = this.renderLayers['tank'].position.x;
			this.renderLayers['backdrop'].position.y = this.renderLayers['tank'].position.y;
			// console.log('adjusting backdrop',
			// 	this.renderLayers['backdrop'].position.x,
			// 	this.renderLayers['backdrop'].position.y,
			// 	this.renderLayers['backdrop'].scale,
			// );
		}
	}
		
	ScreenToWorldCoord( x, y ) {
		x = ( x - this.renderLayers['tank'].position.x ) / this.scale;
		y = ( y - this.renderLayers['tank'].position.y ) / this.scale;
		return [x,y];
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
				// this.update( this.two.frameCount, 0.055 );
				// this.update( this.two.frameCount, 1/60 );
				this.update( this.two.frameCount, 1/30 ); // TODO: make this an app setting
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
			this.sim_queue.push( new FoodChaseSimulation(this.tank,{
				name: 'Saved Tank',
				time: 1000000,
				num_boids: 0,
				num_plants: 0,
				num_rocks: 0,
				num_foods: 0,
				food_friction:true,
				// random_boid_pos: true,
				// random_food_pos: true,
				max_mutation: 0.1,
				cullpct: 0,
				// scale: 0.5,
				current: 0.1,
				food_friction: true,
				tide: 600,
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
			for ( let p of this.tank.plants ) {
				window.vc.AddShapeToRenderLayer( p.geo, Math.random() > 0.5 ? '0' : '-1' );
			}
			// hack settings back in
			this.simulation.settings.num_boids = scene.boids.length;
			this.simulation.settings.num_plants = scene.plants.length;
			this.simulation.settings.num_rocks = scene.obstacles.length;
		}		
	}
	
}