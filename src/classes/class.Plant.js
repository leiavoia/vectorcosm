/* <AI>
Plant — sessile photosynthetic organism. Grows in place, produces Food fruit, and seeds offspring.

OVERVIEW
- Not a PhysicsObject; no velocity. Position is fixed; only a static circle collider is kept.
- Two mass pools: `core` (roots/trunk - drives matter uptake and storage capacity) and `foliage`
  (leaves - drives photosynthesis, also edible by boids). `reserve` is banked matter, spent on
  maintenance then growth. `mass` = core + foliage (display/UI only).
- `life_credits` counts down to death; `health` (0..1, from `CalcHealth()`) speeds or slows decay.

UPDATE LOOP (`Update(delta)`)
1. AGING: `age` advances, `CalcHealth()` runs, `life_credits` drops by
   `delta * health_factor * PLANT_DECAY_SPEED` (poor health drastically accelerates decay via
   `PLANT_HEALTH_PENALTY_COEF`/`_EXP`). `life_credits <= 0` -> `Kill()`.
2. ENVIRONMENT: reads `datagrid.CellAt(x,y)` for `light`/`heat`/`matter`. `LightEfficiency()` and
   `HeatTolerance()` turn these into 0..1 performance multipliers against the plant's genetic
   preferences (`light_pref/tolr`, `heat_pref/tolr`).
3. CAPACITY: `photosyntheticCapacity = sqrt(foliage) * lightEfficiency` (diminishing returns on
   foliage income). `uptakeCapacity = core * soilFactor * heatTolerance`, where `soilFactor`
   (`SoilAbsorptionCurve`) saturates toward 1 as local `cell.matter` grows.
4. ASSIMILATION: `matterAssimilated = min(cell.matter, delta*uptakeCapacity, delta*photosyntheticCapacity)`
   (Liebig's law - light and matter both bottleneck growth) moves from `cell.matter` into `reserve`.
5. MAINTENANCE: `(coreMaint + foliageMaint)^0.75 * cell.heat * delta` (Kleiber's law - upkeep scales
   sublinearly with size) is spent from `reserve` and returned to `cell.matter`.
6. STARVATION: if `reserve < 0`, the shortfall is made up by cannibalizing `foliage` (70% priority)
   then `core` (30% priority), returning lost mass to `cell.matter`. `core <= 0.1` -> `Kill()`.
7. GROWTH: `growthBudget` is a saturating fraction of `reserve` (`saving_pct`, tuned by
   `risk_tolerance` - conservative plants bank more before investing). `CalcGrowthPriorities()`
   softmaxes 8 env/state signals into core/foliage/fruit shares; the foliage share is additionally
   capped at `max_foliage = core^0.75`. The budget is split into `core`/`foliage`/`fruit_credits`;
   any `reserve` left over `core` (storage capacity) spills back to `cell.matter`.
8. FRUIT: `MakeFruit()` runs every tick, spawning `Food` (carrying a DNA seed for viable offspring)
   once `fruit_credits` clears a health-scaled threshold.
9. `RecalcMassAndSize()` updates `mass`/`r`/collision radius from `core + foliage`.

KEY METHODS
- `CalcHealth()` — averages `light_health`/`heat_health` (each computed once from datagrid
  distance-to-preference, then cached) into a smoothed `health` value.
- `CalcGrowthPriorities()` — softmax over 8 signals (heat/light closeness, foliage:core ratio,
  life-credit phase, age, plant crowding, boid predation pressure, core development) weighted by
  DNA-derived `growth_weights`; returns `{core, foliage, fruit}` percentages.
- `RandomizeAge()` — fast-forwards a newborn to a random target age. Not a realistic simulation.
- `RehydrateFromDNA()` — derives all genetic traits, colors, and the `sense` vector (visual/smell
  signature read by boid senses) from `this.dna`.
- `MakeGeneticColor()` — builds a solid color or radial gradient from the DNA color palette.
- `Kill()` — single choke point for death; returns remaining core+foliage+fruit mass to the tank.
- `CreateBody()` / `GeoData()` — render geometry (currently a simple stroke-width-as-foliage circle;
  the shape-generation code below the early `return;` is dead/unused).

KEY TRAITS
- `risk_tolerance` (0..1, reserve-saving aggressiveness), `light_pref/tolr`, `heat_pref/tolr`,
  `fruit_num`, `fruit_size`, `fruit_lifespan`, `fruit_buoy_start/end`, `fruit_complexity`,
  `fruit_flavor`, `growth_weights` (24 values: 8 env factors x 3 growth targets).

GENERATORS
- `RandomPlant(x, y)` — factory creates plants with related DNA.

VISUAL
- `GeoData()` — returns geometry info for the renderer.
- `animation_method` ('skew'/'sway') controls per-frame visual wiggle driven by Camera.
</AI> */

import * as utils from '../util/utils.js'
import Food from '../classes/class.Food.js'
import Rock from '../classes/class.Rock.js'
import DNA from '../classes/class.DNA.js'
import { createCircleCollider, createResult } from './collision.js';

export default class Plant {
	
	static STIFFNESS = 20;
	static MIN_STUMP_MASS = 300;
	static PLANT_DECAY_SPEED = 0.08; // lower number = longer lifespan
	static SHORTFALL_DMG_MOD = 7; // damage multiplier for reserve shortfall
	static GRAZING_DMG_MOD = 3; // damage multiplier for grazing loss
	
	constructor(params) {
		// defaults
		this.otype = 4; // numeric type tag for fast checks (1=Boid, 2=Food, 3=Rock, 4=Plant)
		this.oid = ++globalThis.vc.next_object_id;
		this.x = 0;
		this.y = 0;
		this.r = 1;
		this.dna = 128; // random chars
		this.generation = 1;
		this.dead = false;
		this.age = 0;
		this.life_credits = 3000; // counts down from
		this.density = 5; // spacial scaler; higher increases plant radius
		this.reserve = 1; // matter stored in core. currency for growth.
		this.mass = 2; // total mass (core + foliage) - mostly for UI, could be factored out?
		this.core = 1; // core mass (roots, branches, trunk, etc)
		this.foliage = 1; // foliage mass. edible. not counted as core mass.
		this.fruit_credits = 0; // counts up from zero
		this.health = 1;
		this.dmg = 0; // accumulated damage, affects health
		this.light_health = 0; // 0..1 - zero is a signal it needs to be computed
		this.heat_health = 0; // 0..1
		this.sense = new Array(15).fill(0);
		if ( typeof params === 'object' ) {
			Object.assign(this,params);
		}
		// if `mass` was supplied as a parameter, split the mass semi-random between foliage and core.
		// this can come as a hint from rotting fruit to help propagation.
		if ( params?.mass ) {
			const rand_factor = Math.random() * 0.4 + 0.3; // random factor between 0.3 and 0.7
			this.core = this.mass * rand_factor;
			this.foliage = this.mass * ( 1 - rand_factor );
		}
		// assign the next update based on age.
		this.next_update = this.age + 1;
		// basic genetic traits - individual plant types can add more
		this.traits = {
			life_credits: 3000,
			animation_method:'skew',
			light_pref: 0.65, // 0..1
			light_tolr: 0.5, // 0..1
			heat_pref: 0.65, // 0..1
			heat_tolr: 0.5, // 0..1
			risk_tolerance: 0.5, // 0..1 - 0=conservative ("sweet potato"), 1=reckless ("surface weed"). rehydrated by DNA.
			food_complexity: 3, // foliage food complexity; 3..7; (0..2 reserved for decaying matter)
			food_flavor: 0.5, // foliage food flavour; 0..1
			fruit_num: 1,
			fruit_size: 100,
			fruit_lifespan: 6,
			fruit_buoy_start: -10,
			fruit_buoy_end: -10,
			fruit_complexity: 3,
			fruit_flavor: 0.0, // 0..1
			growth_weights: [], // rehydrated by DNA. controls growth focus based on env factors
			update_freq: 10,
		};
		// begin rehydration from DNA
		this.dna = new DNA( this.dna ); // will either be number of chars, or full string if rehydrating
		this.RehydrateFromDNA();
		// apply DNA-derived lifespan unless a saved value was explicitly provided
		this.life_credits = params?.life_credits || this.traits.life_credits;
		this.CreateBody();
		// collision detection geometry
		this.collision = createCircleCollider( this.r );
		this.RecalcMassAndSize();
	}
	
	Kill() {
		// return any remaining structural biomass to the environment instead of letting
		// it silently vanish - this is the single choke point every death path funnels through
		// (life credit expiry, core<=0.1, external/predation kills, tank resets).
		const leftover_mass = this.core + this.foliage + this.fruit_credits;
		if ( leftover_mass > 0 ) {
			globalThis.vc.tank.AddMatterAt( this.x, this.y, leftover_mass );
		}
		this.dead = true;
	}	
	
	// light response is a saturating function that approaches 1.0 when near preferred light conditions.
	LightEfficiency( light, pref ) {
		const k = pref * 0.5; // half-saturation point
		const peak = 1.0; // TODO: peak performance; genetic tradeoffs
		return ( peak * light ) / ( light + k );
	}
	
	// returns 0..1
	// heat tolerance is a bell curve that crashes when beyond the plant's preferred temperature.
	// plants can shift their preferred temperature and tolerance.
	HeatTolerance( heat, pref ) {
		const peak = 1.0 // TODO: peak performance; genetic tradeoffs
		// biology note: plant performance degrades rapidly when ABOVE preferred temperature.
		// the real life curve is asymetric. use this piecewise hack for cheap compute.
		let tolerance = (heat > pref) ? ( 0.5 * this.traits.heat_tolr ) : this.traits.heat_tolr;
		return peak * Math.exp( -Math.pow( heat - pref, 2 ) / ( 2 * Math.pow( tolerance, 2 ) ) );
	}
	
	// returns 0..1
	SoilAbsorptionCurve( matter, constant=100 ) {
		return matter / ( matter + constant );
	}

	// reduces life credit, including all known modifier effects
	SpendLifeCredits( x ) {
		const health_factor = 1 + ( 1 - this.health );		
		this.life_credits -= x * Plant.PLANT_DECAY_SPEED * health_factor;
	}
				
	/*
	This growth model generally works and gives good-enough results. 
	TODO: Major areas of improvement include adding genetic levers for various specializations.
	TODO: waste cycle to avoid discarded matter from immediately being picked up again.
	TODO: health calculation currently makes no sense and plays no role. reintegrate.
	TODO: light efficiency curve is not really what we want. not sure if cell.light should be in growth calc.
	*/		
	Update( delta ) {
	
		if ( this.dead ) { return; }
		
		// each plant has its own independent update schedule.
		// it would be more efficient to have a global update cycle, but 
		// this has jarring aesthetic qualities we want to avoid.
		// Genetic update frequencies also allow for more interesting niche exploits.
		// CONSIDER: we can directly alter the next_update to "hibernate" or "hurry".
		this.age += delta;
		if ( this.age < this.next_update ) { return; }
		this.next_update = this.age + this.traits.update_freq;
		// from here forward, the "delta" is actually the update_freq clock
		delta = this.traits.update_freq;
		
		//====================================================
		// Aging and death
		//====================================================
	
		// time itself is a burden
		this.SpendLifeCredits( delta );
		
		if ( this.life_credits <= 0 ) {
			this.MakeStump(); // only natural death leaves a stump - not included in Kill()
			this.Kill(); // returns remaining biomass to the grid - single choke point for all death paths
			return false;
		}
		
		
		//====================================================
		// Growth phase setup / Environmental performance
		//====================================================		
		
		// Environmental Grid Data access
		const cell = globalThis.vc.tank.datagrid.CellAt( this.x, this.y );

		// light response curve - typically a saturating function approaching. 0..1, higher is better
		const lightEfficiency = this.LightEfficiency(cell.light, this.traits.light_pref);
		
		// heat tolerance affects metabolic efficiency. 0..1, higher is better
		const heatTolerance  = this.HeatTolerance(cell.heat, this.traits.heat_pref); 

		// soil absorption: increasingly difficult for roots to find matter.
		// NOTE: using a constant for tuning here, but we could make 
		// poor-soil absorption a genetic trait with fun tradeoffs.
		const soilFactor = this.SoilAbsorptionCurve(cell.matter, 100);
		

		//====================================================
		// Health Calculation
		//====================================================		
		
		// environmental difficulties only result in small deviations from baseline health.
		let env_factor = 0.1 * ( lightEfficiency + heatTolerance + soilFactor ); // = 30%
		// "stress" is caused by damage taken from grazing and nutrient deficiencies.
		const total_mass_now = this.core + this.foliage; // ignore fruit
		const dmg_ratio = Math.min( 1.0, this.dmg / ( total_mass_now + 0.01 ) );
		const stress_factor = ( 1 - dmg_ratio ) * 0.7; // remaining 70%
		const health = env_factor + stress_factor;
		this.health = ( this.health + health ) / 2; // blended result
		this.dmg = 0; // reset
		

		//====================================================
		// DEBUG: random periodic grazing knocks down foliage
		//====================================================
				
		// if ( Math.random() < 0.05 ) { 
		// 	const lost = Math.min( this.foliage, Math.random() * 0.4 * this.foliage );
		// 	this.foliage -= lost;
		// 	cell.matter += lost;
		// 	this.dmg += lost * Plant.GRAZING_DMG_MOD;
		// 	// console.log(`Grazing: ${lost.toFixed(1)}`);
		// }
		

		//====================================================
		// Plant capacities
		//====================================================

		// Leaves collect energy. Represents a max cap on matter we can uptake.
		// light intensity has diminishing returns on photosynthesis.
		// eventually, maintenance outpaces ability to photosynthesize, even with kleiber's discount.
		const photosyntheticCapacity = Math.pow( this.foliage, 0.5 ) * lightEfficiency;
		
		// Roots/trunk acquire environmental matter.
		const uptakeCapacity = this.core * soilFactor * heatTolerance;

		// Available matter nearby.
		const availableMatter = cell.matter;

		// core size limits our storage capacity; this may change with genetic traits.
		const max_reserve = this.core;
		

		//====================================================
		// Matter assimilation
		//====================================================

		// draw and store matter from the environment.
		// NOTE: we can ignore max capacity here because we handle 
		// income and expenses as a combined step before capping later.
		const matterAssimilated = Math.min( 
			availableMatter, // do NOT apply delta to raw stock
			delta * uptakeCapacity, 
			delta * photosyntheticCapacity,
		);
		cell.matter -= matterAssimilated;
		this.reserve += matterAssimilated;


		//====================================================
		// Maintenance costs
		//====================================================

		// Living tissue continually consumes stored reserve.
		// Larger plants cost more.
		// Hotter environments increase metabolism, regardless of heat preference. (use env heat stat)

		const CoreMaintenanceRate = 0.02;
		const FoliageMaintenanceRate = 0.05;
		const coreMaint = CoreMaintenanceRate * this.core;
		const foliageMaint = FoliageMaintenanceRate * this.foliage;
		const maint_exponent = 0.75; // kleiber's law - maintenance gets cheaper as plant gets larger
		let maintenance = Math.pow( coreMaint + foliageMaint, maint_exponent ) * cell.heat * delta;

		// Respiration and decay returns matter to environment
		this.reserve -= maintenance; // this can go negative! make up shortfall afterwards
		cell.matter += maintenance;

		// maintenance cost is the primary reducer of life_credits
		this.SpendLifeCredits( maintenance );

		
		//====================================================
		// Tissue starvation - reserve is negative; make up deficit via cannibalization
		//====================================================

		if ( this.reserve < 0 ) {
			// TODO: it would be interesting if plants could hibernate instead of being
			// continually harassed by herbivores or suffering temporarily harsh conditions.
			// could be accomplished using hormone system or hooking into growth_speed trait.
			// TODO: continual reserve deficiency should have escalating health penalties
			// that spend life points / hasten death instead of shrinking to nothing. 
			
			// TODO: how plants prioritize sacrifice can be genetic. for now, hardcoded priorities.
			// NOTE: intentionally ignoring fruit for now
			const foliage_priority = 0.7;
			const core_priority = 0.3;
			
			let shortfall = Math.abs(this.reserve);
			// NOTE: when plants are completely stripped, its a tough spot.
			// Plants should have the ability to get a hail mary and overdrive demand.
			// We already have risk_tolerance, so this is a fine place to use it.
			const demand = shortfall * ( 1 + this.traits.risk_tolerance ) * ( 1 + this.traits.risk_tolerance );
			
			// First pass: take priority amounts
			let foliage_loss = Math.min(this.foliage, demand * foliage_priority);
			let core_loss = Math.min(this.core, demand * core_priority);
			
			// Second pass: use any remaining tissue to cover shortfalls
			const foliage_shortfall = Math.max(0, demand * foliage_priority - foliage_loss);
			const core_shortfall = Math.max(0, demand * core_priority - core_loss);
			
			// core_shortfall is always 0 whenever core has capacity left to give, so it never actually contributes here
			core_loss += Math.min(this.core - core_loss, foliage_shortfall);
			foliage_loss += Math.min(this.foliage - foliage_loss, core_shortfall);
			
			this.foliage -= foliage_loss;
			this.core -= core_loss;
			this.reserve += foliage_loss + core_loss;
			cell.matter += foliage_loss + core_loss;
			// shrank to nothing - you died
			if ( this.core <= 0.1 ) {
				this.Kill();
				return;
			}
			
			// the original shortfall counts as damage to the plant indicates "stress"
			this.dmg += shortfall * Plant.SHORTFALL_DMG_MOD;
		}

		//====================================================
		// Growth investment
		//====================================================

		else {
			// figure out growth budget based on risk tolerance and reserve savings
			// const min_invest_pct = 0.05; // even a fully conservative plant still grows a little
			// const max_invest_pct = 0.95; // even a fully reckless plant keeps a sliver in reserve
			// const invest_pct = min_invest_pct + ( max_invest_pct - min_invest_pct ) * this.traits.risk_tolerance;
			// const growthBudget = this.reserve * invest_pct;

			// use this alternative saturating formula if above linear formula is too simplistic
			const saving_target = 100;
			const saving_buffer = 0.05;
			const saving_mod = saving_target * ( saving_buffer + (1 - saving_buffer) * this.traits.risk_tolerance );
			const saving_pct = saving_mod / ( saving_mod + this.reserve );
			const growthBudget = this.reserve * saving_pct;
			
			// maximum foliage we can support is based on core.
			// it take proportionally more core to support more foliage.
			// TODO: could be genetic trait for higher maintenance tradeoff.
			const max_foliage_scaler = 1.0;
			const max_foliage = max_foliage_scaler * Math.pow( this.core, 0.75 );
			
			// Allocation growth priorities - blend of genetic factors, environment, and situational necessity
			const priorities = this.CalcGrowthPriorities();
			const idealCore = this.core * priorities.core;
			// minIdealFoliage prevents a permanent zero-lock when foliage=0, otherwise
			// it would be mathematically impossible to ever regrow foliage from zero.
			const minIdealFoliage = 0.01;
			const idealFoliage = Math.max(minIdealFoliage, Math.min((this.foliage + 0.01) * priorities.foliage, max_foliage));
			priorities.foliage = idealFoliage / ( idealFoliage + this.foliage + 0.01 );
			priorities.core = idealCore / ( idealCore + this.core + 0.01 );
			
			// normalize to 1.0
			const total = priorities.core + priorities.foliage + priorities.fruit;
			priorities.core /= total;
			priorities.foliage /= total;
			priorities.fruit /= total;
						
			// commit growth to all categories
			const growCore = growthBudget * priorities.core;
			const growLeaves = growthBudget * priorities.foliage;
			const growFruit = growthBudget * priorities.fruit;
			this.core     += growCore;
			this.foliage  += growLeaves;
			this.fruit_credits += growFruit;
			const total_growth = growCore + growLeaves + growFruit;
			this.reserve -= total_growth;
			
			// the cost of life is death
			this.SpendLifeCredits( total_growth ) ;
					
			// reserve cannot end over capacity
			if ( this.reserve > max_reserve ) {
				const extra = this.reserve - max_reserve;
				this.reserve -= extra;
				cell.matter += extra; // return excess to the environment
				// overdraft does not count against life credits
			}
			
			// make the fruit with credits we stores up
			this.MakeFruit();
		}

		//====================================================
		// Geometry update
		//====================================================

		this.RecalcMassAndSize();

		// debug
		// const life_pct = Math.max( 0, Math.min( 1, this.life_credits / this.traits.life_credits ) );
		// console.log(
		// 	`life=${life_pct.toFixed(2)}, ` +
		// 	// `health=${this.health.toFixed(2)}, ` +
		// 	`Rsv=${starting_reserve.toFixed(1)}→${this.reserve.toFixed(1)}, ` +
		// 	`mass=${this.mass.toFixed(1)}, ` +
		// 	`coreM=${this.core.toFixed(1)}, ` +
		// 	`foliageM=${this.foliage.toFixed(1)}, ` +
		// 	`fruitM=${this.fruit_credits.toFixed(1)}, ` +
		// 	`pUptake=${uptakeCapacity.toFixed(1)}, ` +
		// 	`photoCap=${photosyntheticCapacity.toFixed(1)}, ` +
		// 	`Mtr=${matterAssimilated.toFixed(1)}, ` +
		// 	`Cost=${maintenance.toFixed(1)}, ` +
		// 	`gB=${growthBudget.toFixed(2)}, ` + 
		// 	`savePct=${saving_pct.toFixed(2)}, ` +
		// 	`heatTol=${heatTolerance.toFixed(2)}, ` +
		// 	`lightEf=${lightEfficiency.toFixed(2)}, ` +
		// 	`soil=${soilFactor.toFixed(2)}`
		// );
		
	}
	
	// updates combined mass and the collision radius.
	RecalcMassAndSize() {
		this.mass = this.core + this.foliage;
		this.r = Math.sqrt( 2 * this.mass / Math.PI ) * this.density;
		this.collision.radius = this.r;
	}
	
	Export( as_JSON=false ) {
		let output = { classname: 'Plant' };
		// note: next_update and dmg are considered temporal and get ignored. 
		let datakeys = ['x','y','fruit_credits','age','life_credits',
			'mass','health','dna','generation','foliage', 'core', 'reserve'];
		for ( let k of datakeys ) { 
			if ( this.hasOwnProperty(k) ) { 
				output[k] = this[k];
			} 
 		}
		return as_JSON ? JSON.stringify(output) : output;
	}
	
	// returns the amount eaten
	Eat( amount ) { 
		if ( this.dead || this.foliage <= 0 ) { return 0; }
		const eaten = Math.min( this.foliage, amount );
		this.foliage -= eaten;
		this.dmg += eaten * Plant.GRAZING_DMG_MOD;
		this.RecalcMassAndSize();
		return eaten;
	}
	
	// returns TRUE if the food is edible by the boid
	IsEdibleBy( boid ) {
		return (1 << (this.traits.food_complexity-1)) & boid.traits.food_mask;
	}	
		
	GeoData() {
		return this.geo;
	}

	MakeFruit() {
		// fruit grows to a certain threshold size. 
		// Beyond the threshold, there is an increasing chance of fruiting.
		// Threshold is elastic based on plant core mass.
		// In real life, larger plants produce more fruit. In the simulation,
		// too many fruit objects becomes a performance problem. 
		// The consolation prize is bigger fruit.
		const fruit_size = this.traits.fruit_size;
		const core_fruit_ratio = Math.min( 1.0, this.core / this.traits.fruit_size );
		const base_threshold = this.traits.fruit_num * fruit_size; // base threshold
		const threshold = base_threshold * Math.sqrt(core_fruit_ratio); // small increases as core mass grows
		if ( this.fruit_credits > threshold ) {
			// chance of fruiting goes up the further past the threshold we are
			const overage_pct = ( this.fruit_credits - threshold ) / threshold;
			const roll = Math.random() * this.traits.risk_tolerance; // intrepid plants will hold out for more
			if ( overage_pct >= roll ) {
				// create the fruit
				const food_value = this.fruit_credits / this.traits.fruit_num;
				const wiggle = 0.2 * Math.sqrt( this.core );
				if ( globalThis.vc.tank.foods.length < globalThis.vc.max_foods ) {
					for ( let n=0; n < this.traits.fruit_num; n++ ) {
						const f = new Food(
							// fruit around the edges to prevent violent expulsion.
							// (unless we want that as a feature?)
							// Square shape over circular plant creates variability.
							this.x + (Math.random() < 0.5 ? -1 : 1) * wiggle,
							this.y + (Math.random() < 0.5 ? -1 : 1) * wiggle,
							{ 
							value: food_value, 
							lifespan: ( this.traits.fruit_lifespan * ( 1 - (Math.random() * 0.2 ) ) ),
							buoy_start: this.traits.fruit_buoy_start + ( 100 - (200 * Math.random()) ),
							buoy_end: this.traits.fruit_buoy_end + ( 100 - (200 * Math.random()) ),
							flavor: this.traits.fruit_flavor,
							complexity: this.traits.fruit_complexity,
							} );
						// if there is room for more plants in the tank, make it a viable seed
						if ( globalThis.vc.tank.plants.length < globalThis.vc.simulation.settings.num_plants ) {
							// viability depends on health
							if ( Math.random() < this.health ) {
								let seed = new DNA(	this.dna.str );
								seed.mutate( 2, false );
								f.seed = seed.str;
								f.light_pref = this.traits.light_pref;
								f.heat_pref = this.traits.heat_pref;
							}
						}
						globalThis.vc.tank.foods.push(f);
					}
				}
				// if we cancel the food, return accumulated matter to the tank
				else {
					globalThis.vc.tank.AddMatterAt( this.x, this.y, this.fruit_credits );
				}
				// reset fruiting cycle
				this.fruit_credits = 0; 
			}
		}
	}
	
	MakeStump() {
		// must have enough core mass remaining to make it worth rendering
		if ( this.core <= Plant.MIN_STUMP_MASS ) { return; }
		// TODO: should stump lock up matter?
		const r = Math.sqrt( 2 * this.core / Math.PI ) * this.density * 0.88;
		// we want points around the perimeter of the core and one in the exact center.
		// the default "rock" structure is chunky and asymmetric. we can do better.
		// points for rocks are defined in local coordinate space.
		const num_points = 3 + Math.floor(Math.random() * 5);
		const points = [];
		for ( let i=0; i < num_points; i++ ) {
			const angle = Math.random() * 2 * Math.PI;
			const px = r + r * Math.cos(angle);
			const py = r + r * Math.sin(angle);
			points.push([px, py]);
		}
		// add the center point
		points.push([r, r]);
		let rock = new Rock( {
			x: this.x - r,
			y: this.y - r,
			w: r * 2,
			h: r * 2,
			points,
			color_scheme: 'Wood',
			complexity: 0,
			life_credits: this.core
		})
		globalThis.vc.tank.obstacles.push(rock);
	}
	
	// stages a plant at a future point in its lifespan. 
	// not based on actual growth patterns, just spitballed to get things moving.
	RandomizeAge() {
		// reset to newborn state before fast-forwarding
		this.age = utils.RandomFloat( 0, this.traits.life_credits );
		this.next_update = this.age + this.traits.update_freq;
		this.life_credits = this.age;
		this.core = utils.RandomFloat( 10, 300 );
		this.foliage = this.core * utils.RandomFloat( 0.5, 1.5 );
		this.reserve = utils.RandomFloat( 0, this.core );
		this.health = 1;
		this.light_health = 0;
		this.heat_health = 0;
		// head start on fruit cycle
		const fruit_size = this.traits.fruit_size * this.health;
		const fruit_threshold = this.traits.fruit_num * fruit_size;
		this.fruit_credits = utils.RandomFloat( 0.5 * fruit_threshold, fruit_threshold );
		this.RecalcMassAndSize();
	}	
	
	MakeGeneticColor( whatfor, colors ) {
		let num_colors = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} num colors gene 2`,2,1), 0, colors.length ) );
		
		// transparent
		if ( num_colors===0 ) {
			return 'transparent';
		}
		
		// single color
		if ( num_colors===1 ) {
			let index = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} color index 0 `,2,1), 0, colors.length-1 ) );
			return colors[index];
		}
		
		// gradient
		let stops = [];
		for ( let i=0; i < num_colors; i++ ) {
			let index = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} color index ${i}`,2,1), 0, colors.length-1 ) );
			let stop_at = this.dna.mix( this.dna.genesFor(`plant ${whatfor} stop index ${i}`,2,1), 0, 1 );
			let stop = [stop_at, colors[index]];
			stops.push(stop);		
		}
		
		// sort the stops by ascending stop value
		stops.sort( (a,b) => a[0] - b[0] );
		
		// make sure we have stops on 0 and 1
		stops[0][0] = 0;
		stops[ stops.length-1 ][0] = 1;
		
		// whacky stuff we copied from boid BodyPlans
		const length = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient length`,2,1), 100, 1000 );
		const width = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient width`,2,1), 100, 1000 );
		const longest_dim = Math.max(length,width);
		let xoff = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient xoff`,2,1), -length/2, length/2 );
		let yoff = 0;
		let radius = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient radius`,2,1), longest_dim/10, longest_dim, longest_dim, 2.5 );
		const flip = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient axis flip`,2,1) ) < 0.33;
		// radial gradients only - linear looks wrong for plants unless you can orient it per-leaf
		let grad = {type:'radial', xoff, yoff, radius, stops, units:'userSpaceOnUse' };
		const spreadNum = this.dna.shapedNumber( this.dna.genesFor(`${whatfor} gradient repeat`,2,1) );
		grad.spread = (spreadNum > 0.66) ? 'pad' : ( spreadNum > 0.33 ? 'reflect' : 'repeat' );	
		if ( flip ) { grad.spread = 'reflect'; }
		return grad;
	}
	
	// this mines the DNA for data
	RehydrateFromDNA() {
		
		// growth weights:
		// there are a number of environmental factors that influence growth of core, foliage, and fruit. 
		// Foreach growth priority, create a set of weights for each env factor, range -1..1.
		// Softmax will handle normalization during the growth function.
		// Data structure is a 1-dim array for CPU simplicity. Step by threes on iteration. 
		const num_env_factors = 8;
		for ( let i=0; i < num_env_factors; i++ ) {
			this.traits.growth_weights.push( this.dna.mix( this.dna.genesFor(`growth weight ${i}-0`,1,1), -1, 1 ) );
			this.traits.growth_weights.push( this.dna.mix( this.dna.genesFor(`growth weight ${i}-1`,1,1), -1, 1 ) );
			this.traits.growth_weights.push( this.dna.mix( this.dna.genesFor(`growth weight ${i}-2`,1,1), -1, 1 ) );
		}
		
		// determine the other traits
		const total_fruit_mass = Math.round( 0.5 * ( 
			this.dna.shapedInt( this.dna.genesFor('total_fruit_mass_1',2), 5, 1000, 50, 6 ) +
			this.dna.shapedInt( this.dna.genesFor('total_fruit_mass_2',2), 5, 200, 50, 2 )
		) );
		this.traits.fruit_num = this.dna.shapedInt( this.dna.genesFor('fruit_num',1), 1, 4, 1, 4 );
		this.traits.fruit_size = Math.round( total_fruit_mass / this.traits.fruit_num );
		this.traits.fruit_lifespan = this.dna.mix( this.dna.genesFor('fruit_lifespan',2), 20, 100 );
		this.traits.fruit_lifespan = Math.round( this.traits.fruit_lifespan * (total_fruit_mass / 100) ); // more fruit lasts longer
		this.traits.fruit_buoy_start = this.dna.mix( this.dna.genesFor('fruit_buoy_start',2), -100, 100 );
		this.traits.fruit_buoy_end = this.dna.mix( this.dna.genesFor('fruit_buoy_end',2), -100, 100 );
		const fruit_complexity_gene = 0x08000000 | this.dna.genesFor('fruit_complexity',2,1);
		this.traits.fruit_complexity = 2 + Math.ceil( this.dna.shapedInt( fruit_complexity_gene, 0, 599, 150, 1.5 ) / 100 );
		this.traits.fruit_flavor = this.dna.mix( this.dna.genesFor('fruit flavor',2,1), 0, 1, 0.5, 2 ); // create slight rarity
		const food_complexity_gene = 0x08000000 | this.dna.genesFor('food_complexity',2,1);
		this.traits.food_complexity = 2 + Math.ceil( this.dna.shapedInt( food_complexity_gene, 0, 399, 175, 2 ) / 100 );
		this.traits.food_flavor = this.dna.mix( this.dna.genesFor('food flavor',2,1), 0, 1, 0.5, 4 ); // create more rarity
		this.traits.update_freq = this.dna.shapedInt( this.dna.genesFor('update_freq',2,1), 3, 120, 4, 4 );
		this.traits.life_credits = this.dna.shapedInt( this.dna.genesFor('life_credits',3,1), 1000, 10000, 3000, 2.2 );
		this.traits.light_pref = this.dna.shapedNumber( this.dna.genesFor('light_pref',2,1), 0, 1 );
		this.traits.light_tolr = this.dna.shapedNumber( this.dna.genesFor('light_tolr',2,1), 0, 1 );
		this.traits.heat_pref = this.dna.shapedNumber( this.dna.genesFor('heat_pref',2,1), 0, 1 );
		this.traits.heat_tolr = this.dna.shapedNumber( this.dna.genesFor('heat_tolr',2,1), 0, 1 );
		this.traits.density = this.dna.shapedNumber( this.dna.genesFor('density',2,1), 2, 20, 4, 4 ); // distribution could be improved
		this.traits.risk_tolerance = this.dna.shapedNumber( this.dna.genesFor('risk_tolerance',2,1), 0, 1 );
		this.traits.linewidth = this.dna.shapedInt( this.dna.genesFor('linewidth',2,1), 0, 10 );
		this.traits.radius = this.dna.shapedInt( this.dna.genesFor('radius',2,1), 100, 350 );
		this.traits.num_points = this.dna.shapedInt( this.dna.genesFor('num_points',2,1), 5, 12 );
		this.traits.curved = this.dna.shapedNumber( this.dna.genesFor('curved',2,1) ) > 0.75;
		this.traits.discreet = this.dna.shapedNumber( this.dna.genesFor('discreet',2,1) ) > 0.35;
		this.traits.centered = this.dna.shapedNumber( this.dna.genesFor('centered',2,1) ) > 0.2;
		this.traits.globular = this.dna.shapedNumber( this.dna.genesFor('globular',2,1) ) > 0.5;
		this.traits.points_slur = this.dna.shapedNumber( this.dna.genesFor('points_slur',2,1) ) > 0.3;
		this.traits.points_per_shape = this.dna.shapedInt( this.dna.genesFor('points_per_shape',2,1), 2, Math.min(4,this.traits.num_points) );
		this.traits.point_increment = this.dna.shapedInt( this.dna.genesFor('point_increment',2,1), 1, (this.traits.points_per_shape - ( (this.traits.centered?1:0) + 1)) || 1 );
		this.traits.cap = this.dna.shapedNumber( this.dna.genesFor('cap',2,1) ) > 0.6 ? 'round' : '';
		this.traits.dash1 = this.dna.shapedInt( this.dna.genesFor('dash1',1), 0, 10, 3, 2 );
		this.traits.dash2 = this.dna.shapedInt( this.dna.genesFor('dash2',1), 0, 10, 3, 2 );
		this.traits.dashes = [ this.traits.dash1, this.traits.dash2 ];
		if ( this.dna.shapedNumber( this.dna.genesFor('has dashes',2,1), 0, 1 ) > 0.65 ) {
			this.traits.dashes = null;
			this.traits.dash1 = null;
			this.traits.dash2 = null;
		}
		this.traits.smeth = this.dna.shapedNumber( this.dna.genesFor('smeth',2,1) );
		if ( this.traits.smeth < 0.25 ) { this.traits.smeth = 'x'; }
		else if ( this.traits.smeth < 0.5 ) { this.traits.smeth = 'y'; }
		else if ( this.traits.smeth < 0.90 ) { this.traits.smeth = 'a'; }
		else { this.traits.smeth = ''; }
		this.traits.animation_method = (this.traits.centered && this.traits.discreet) ? 'sway' : 'skew';
		
		// when points_per_shape == 2, individual shapes are composed of single lines.
		// we may wish to handle these differently
		const is_linear = this.traits.points_per_shape == 2;
		
		// if the shape is composed of line segments, turn off curves (which just look like giant ovals)
		// TODO: we can keep curves if we want to fiddle with bezier handles later.
		if ( this.traits.linewidth && is_linear ) { 
			const multiplier = Math.round( this.dna.mix( this.dna.genesFor('LWM'), 2, 6 ) );
			this.traits.linewidth *= multiplier;
		}
		
				
		// COLORS ----------------------\/----------------------------

		// create a color palette
		this.traits.colors = [];
		
		// the primary hue is based on the food value of the foliage, mapped to pleasant plant-like color range.
		// heat and light preferences affect the saturation, lightness, transparency.
		const primary_h = utils.MapToRange( this.traits.food_flavor, 0, 1, 0.1, 0.68 );
		const primary_s = utils.MapToRange( this.traits.heat_pref, 0, 1, 0.15, 0.55 );
		const primary_l = utils.MapToRange( this.traits.heat_tolr, 0, 1, 0.15, 0.55 );
		const primary_t = utils.MapToRange( this.traits.light_pref, 0, 1, 0.5, 1.0 );
		let primary_arr = utils.hsl2rgb(primary_h, primary_s, primary_l);
		primary_arr.push(primary_t);
		primary_arr = primary_arr.map( c => Math.trunc(c * 255) );
		const primary_color = utils.RGBArrayToHexColor( primary_arr );
		this.traits.colors.push( primary_color );
		
		// the secondary color is mixed from a variety of more subtle traits
		const secondary_h = utils.MapToRange( this.traits.fruit_flavor, 0, 1, 0.1, 0.68 );
		const secondary_s = utils.MapToRange( this.traits.fruit_complexity, 3, 6, 0.15, 0.55 );
		const secondary_l = utils.MapToRange( this.traits.risk_tolerance, 0, 1, 0.15, 0.55 );
		const secondary_t = utils.MapToRange( Math.min(this.traits.fruit_size, 500), 0, 500, 0.5, 1.0 );
		let secondary_arr = utils.hsl2rgb(secondary_h, secondary_s, secondary_l);
		secondary_arr.push(secondary_t);
		secondary_arr = secondary_arr.map( c => Math.trunc(c * 255) );
		const secondary_color = utils.RGBArrayToHexColor( secondary_arr );
		this.traits.colors.push( secondary_color );
							
		// genetic colors just for fun
		const num_colors = 3;
		for ( let i=0; i < num_colors; i++ ) {
			const genes = this.dna.genesFor(`plant color ${i} g`, 12);
			const hue = ( this.dna.mix( genes.slice(0,1), 0.15, 0.55 ) + this.dna.mix( genes.slice(2,3), 0.15, 0.55 ) ) / 2;
			const saturation = this.dna.mix( genes.slice(3,6), 0.20, 0.50 );			
			const lightness = this.dna.mix( genes.slice(6,9), 0.20, 0.55 );			
			const transp = this.dna.mix( genes.slice(9,12), 0.5, 1.0 );
			let arr = utils.hsl2rgb(hue, saturation, lightness);
			arr.push(transp);
			arr = arr.map( c => Math.trunc(c * 255) );
			const color = utils.RGBArrayToHexColor( arr );
			this.traits.colors.push( color );
		}
		
		// fill and stroke colors
		this.traits.fill = this.MakeGeneticColor( 'fill', this.traits.colors );
		this.traits.stroke = this.MakeGeneticColor( 'stroke', this.traits.colors );
		// sane default if we got double transparent
		if ( this.traits.fill == this.traits.stroke ) {
			this.traits.fill = this.traits.colors[0];
			this.traits.stroke = this.traits.colors[1];
		}
				
		// linear segments may not be transparent - entire plant would disappear
		if ( is_linear && this.traits.stroke === 'transparent' ) {
			this.traits.stroke = this.traits.fill;
			this.traits.fill = 'transparent';
		} 				
				
						
		// SENSORY INFO ---------------------\/-------------------------

		// visual color
		let visual_color = this.traits.colors.find( c => c !== 'transparent' ) || '#FFFFFF';
		visual_color = utils.HexColorToRGBArray( visual_color );
		const _hsl = utils.rgb2hsl( visual_color[0], visual_color[1], visual_color[2] );
		const _hue_angle = _hsl[0] * Math.PI * 2;
		const _v_amp = Math.max( 0.05, _hsl[2] );
		this.sense[0] = Math.cos( _hue_angle ); // v1 cos
		this.sense[1] = Math.sin( _hue_angle ); // v1 sin
		this.sense[2] = 0.5 * _v_amp; // v1 amplitude
		// visual texture
		const _hue_angle2 = this.dna.shapedNumber( this.dna.genesFor('plant texture',2,1), 0, Math.PI*2, Math.PI, 1);
		const _v2_amp   = this.dna.shapedNumber( this.dna.genesFor('plant texture amp',2,1), 0, 1, 0.5, 2 );
		this.sense[3] = Math.cos( _hue_angle2 ); // v2 cos
		this.sense[4] = Math.sin( _hue_angle2 ); // v2 sin
		this.sense[5] = _v2_amp; // v2 amplitude
		// primary smell
		const _s1_angle = this.dna.shapedNumber( this.dna.genesFor('plant smell',2,1), 0, Math.PI*2, Math.PI, 1 );
		const _s1_amp   = Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('plant smell amp',2,1), 0, 1, 0.5, 2 ) );
		this.sense[6] = Math.cos( _s1_angle ); // s1 cos
		this.sense[7] = Math.sin( _s1_angle ); // s1 sin
		this.sense[8] = _s1_amp; // s1 amplitude
		// secondary smell
		const _s2_angle = this.dna.shapedNumber( this.dna.genesFor('plant smell 2',2,1), 0, Math.PI*2, Math.PI, 1 );
		const _s2_amp   = Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('plant smell 2 amp',2,1), 0, 1, 0.5, 2 ) );
		this.sense[9]  = Math.cos( _s2_angle ); // s2 cos
		this.sense[10] = Math.sin( _s2_angle ); // s2 sin
		this.sense[11] = _s2_amp; // s2 amplitude
				
	}		
	
	// Returns object with named percentages: { core: 0.5, foliage: 0.3, fruit: 0.2 }
	CalcGrowthPriorities() {
		// ENVIRONMENTAL DATA COLLECTION ----------------\/-------------------
		const cell = globalThis.vc.tank.datagrid.CellAt( this.x, this.y );
		
		// Heat: how close are we to preference? 1=near, 0=far
		const heat = 1 - Math.abs( cell.heat - this.traits.heat_pref );
		
		// Light: how close are we to preference? 1=near, 0=far
		const light = 1 - Math.abs( cell.light - this.traits.light_pref );
		
		// current foliage to core ratio
		const foliage_ratio = 1 - this.foliage / this.core;
		
		// current life credits - use cosine to put 1 in the middle
		const life_credits = 0.5 + 0.5 * Math.cos( ( this.life_credits / this.traits.life_credits ) * Math.PI * 2 + Math.PI );
		
		// age: we dont have a max age, so use a saturating function based on spitball number
		const age = 1 - ( this.age * 0.001 ) / ( this.age * 0.001 + 1 );
		
		// friends: nearby plants competing for the same light/matter (crowding pressure).
		// no hard upper limit, so curve to 1.
		let friends = globalThis.vc.tank.grid.GetObjectsByCoords(this.x, this.y)
			.filter(x => x.otype === 4 && x !== this)
			.length;
		friends = ( friends * 0.25 ) / ( ( friends * 0.25 ) + 1 );
		
		// enemies: nearby boids that may graze on foliage/fruit (predation pressure).
		// no hard upper limit, so curve to 1.
		let enemies = globalThis.vc.tank.grid.GetObjectsByCoords(this.x, this.y)
			.filter(x => x.otype === 1)
			.length;
		enemies = ( enemies * 0.25 ) / ( ( enemies * 0.25 ) + 1 );
		
		// core development: how big are we?
		const core_dev = 1 - ( this.core * 0.02 ) / ( this.core * 0.02 + 1 );
		
		// CALCULATE WEIGHTS AND SOFTMAX ----------------\/-------------------
		const weights = this.traits.growth_weights;
		const inputs = [ heat, light, foliage_ratio, life_credits, age, friends, enemies, core_dev ];
		const rawScores = [0, 0, 0];

		// Step 1: Accumulate raw scores
		for (let i = 0; i < inputs.length; i++) {
			const signal = inputs[i];
			rawScores[0] += signal * weights[i*3];   // Core
			rawScores[1] += signal * weights[i*3+1]; // Foliage
			rawScores[2] += signal * weights[i*3+2]; // Fruit
		}
	
		// Step 2: Numerical Stability Trick
		// Find the maximum raw score and subtract it from all scores.
		// This prevents JavaScript from hitting "Infinity" if raw scores get large.
		const maxScore = Math.max(...rawScores);	
				
		// Step 3: Compute exponentials (e^x) and their sum
		const expScores = rawScores.map(score => Math.exp(score - maxScore));
		const totalExpSum = expScores.reduce((sum, val) => sum + val, 0);

		// Step 4: Normalize to get probabilities that sum to 1
		return {
			core: expScores[0] / totalExpSum,
			foliage: expScores[1] / totalExpSum,
			fruit: expScores[2] / totalExpSum
		};
	}
	
	CreateBody() {
	
		/*
		things that we could visually represent:
			- core mass
			- foliage mass
			- health
			- light_pref
			- heat_pref
			- light_tolr
			- heat_tolr
			- foliage food value
		
		with features:
			- fill color H S L
			- border color H S L
			- linewidth
			- dashes
			- points / polygon
		*/
		
		// linewidth represents foliage. 
		// lines are drawn at the boundary with center of line on circle perimeter. 
		// we need to calculate as follows:
		// total circle = mass (core + foliage)
		// foliage area = total area * (foliage / mass)
		// 
		const linewidth = Math.sqrt( 2 * this.foliage / Math.PI ) * this.density;
		this.geo = {
			// type:'circle',
			type:'polygon',
			n: this.traits.food_complexity,
			fill: 'transparent', // this.traits.fill, //'#81625499',
			stroke: this.traits.stroke, // '#4f8d47BB'
			linewidth: linewidth,
			r: Math.sqrt( 2 * this.mass / Math.PI ) * this.density,
			rotation: utils.RandomFloat( 0, Math.PI * 2 ),
			// dashes: [2,3]
		};
		return; // TEMPORARY
		
		// TODO: REPLACE CODE BELOW WITH NEW FLOWERS
		
		const t = this.traits; // alias for cleanliness
		
		// if ( this.geo ) { this.geo.remove( this.geo.children ); }
		
		if ( !this.shapes?.length ) { 
				
			this.points = [];
			this.shapes = [];
			
			// points are truly random, not derived from DNA
			for ( let i=0; i < t.num_points; i++ ) {
				this.points.push( [
					utils.RandomInt( -t.radius, t.radius ),
					utils.RandomInt( -t.radius, t.radius )
				]);
			}	
			
			// point sorting
			if ( t.smeth == 'x' ) { this.points.sort( this.SortByX ); }
			else if ( t.smeth == 'y' ) { this.points.sort( this.SortByX ); }
			else if ( t.smeth == 'a' ) { this.points.sort( this.SortByAngle ); }
					
			// if the shape is "centered", it threads all points back through the center
			// when creating individual sub-shapes (petals), creating an aster-like pattern.
			
			// slur the points around.
			// TODO: there are lots of fun ways we could do this in the future.
			// For now, "slur" just means shift all points upwards to make an upright plant.
			if ( t.points_slur ) {
				this.points = this.points.map( p => [ p[0], p[1] - t.radius * 2 ] );
			}
			
			// label all of the points with an ID number - we can use this to animate growth later
			for ( let i=0; i < this.points.length; i++ ) { this.points[i][2] = i+1; }
			
			// if the shape is NOT centered, use the center point as a starting point
			if ( !t.centered ) { this.points.unshift([0,0,0]); }
			
			// if the shape is "centered", we automatically insert the center point
			// to begin each shape. Center points are in addition to existing points,
			// so we need to conditionally subtract one from many of the following calculations.
			const subtract_one = t.centered ? 1 : 0;
			
			// points per shape only applies if we are going to create individual shapes
			
			// point increments determines how many indexes to skip when iterating through the point array.
			// skipping fewer points creates overlapping shapes. Skipping more creates separate, discontinuous shapes.
			
			// create discreet shapes
			if ( t.discreet ) {
				for ( let i=0; i < this.points.length - (t.points_per_shape-subtract_one); i += t.point_increment ) {
					const slice = this.points.slice( i, i + ( t.points_per_shape - subtract_one ) );
					slice.sort( this.SortByAngle ); // not required but usually aesthetically better
					if ( t.centered ) { slice.unshift([0,0,0]); } // start from zero on every shape
					this.shapes.push(slice);
				}
			}
			
			// create a single continuous shape
			else {
				this.shapes[0] = [];
				const points_per_shape = t.globular ? this.points.length : t.points_per_shape ;
				const point_increment = t.globular ? this.points.length : t.point_increment ;
				for ( let i=0; i < this.points.length - (points_per_shape-(1+subtract_one)); i += point_increment ) {
					const slice = this.points.slice( i, i + ( points_per_shape - subtract_one ) );
					if ( t.centered ) { slice.unshift([0,0,0]); } // start from zero on every loop
					this.shapes[0].push(...slice);
				}
			}
		
		}
			
		// create the final shape
		this.geo = { type:'group', children: [], animation_method:this.traits.animation_method };
		for ( let points of this.shapes ) {
			let shape = { 
				type: 'path',
				points:points,
				fill: t.fill,
				linewidth: t.linewidth,
				stroke: t.stroke,
				curved: t.curved,
			};
			if ( t.dashes ) shape.dashes = t.dashes;		
			if ( t.cap ) shape.cap = t.cap;		
			this.geo.children.push(shape);
		}
	}
	SortByY(a,b) { return b[1] - a[1]; }
	SortByX(a,b) { return b[0] - a[0]; }
	SortByAngle(a,b) { return Math.atan2(b[1],b[0]) - Math.atan2(a[1],a[0]); }
}

// buffer that holds plants for random remixing to create samey-looking plantscapes
const motherplants = [];

export function RandomPlant(x=0,y=0) {
	let plant;
	let reuse = 0.65;
	// grab a used plant
	if ( motherplants.length && Math.random() < reuse ) { 
		let mother = motherplants.pickRandom();
		let dna = new DNA( mother.dna.str );
		dna.mutate( 2, false );
		plant = new Plant({dna, x, y}); 
	}
	// create a new plant from scratch
	else {
		plant = new Plant({x,y}); 
	}
	// cache the plant for reuse
	if ( !motherplants.length || Math.random() > reuse ) { // note inverted comparison
		motherplants.push(plant);
		if ( motherplants.length > 10 ) {
			motherplants.unshift();
		}
	}
	return plant;
}
	