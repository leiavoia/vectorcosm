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
   preferences (`light_pref/tolr`, `heat_pref/tolr`). Both are asymmetric gaussians peaking at
   their `_pref` (harsher falloff above = photoinhibition/heat stress, gentler below = light-
   limited/cold-tolerant); their peak/width are cached genetic terms (`light_peak/width`,
   `heat_peak/width`, set in `RehydrateFromDNA`) that conserve each gaussian's area, so narrow
   niches (specialists) run taller and wide niches (generalists) run shorter - real tradeoff,
   not a free lunch.
3. CAPACITY: `photosyntheticCapacity = sqrt(foliage) * lightEfficiency` (diminishing returns on
   foliage income). `uptakeCapacity = core * soilFactor * heatTolerance`, where `soilFactor`
   (`SoilAbsorptionCurve`) saturates toward 1 as local `cell.matter` grows.
4. ASSIMILATION: roots reach every grid cell touched by `this.r` (`datagrid.CellsInRadius()`);
   the home cell is fully accessible, others weighted 0..1 by reach depth. Each cell's supply is
   `min(cell.matter, delta*weight*core*soilFactor*heatTolerance)`, summed then capped by
   `delta*photosyntheticCapacity` (Liebig's law), scaling every cell's draw down proportionally.
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
- `CalcHealth()` — computes the health value based on environment and status info.
- `CalcGrowthPriorities()` — softmax over 8 signals (heat/light closeness, foliage:core ratio,
  life-credit phase, age, plant crowding, boid predation pressure, core development) weighted by
  DNA-derived `growth_weights`; returns `{core, foliage, fruit}` percentages.
- `RandomizeAge()` — fast-forwards a newborn to a random target age. Not a realistic simulation.
- `RehydrateFromDNA()` — derives all genetic traits, colors, and the `sense` vector (visual/smell
  signature read by boid senses) from `this.dna`.
- `MakeGeneticColor()` — builds a solid color or radial gradient from the DNA color palette.
- `Kill()` — single choke point for death; returns remaining core+foliage+fruit+reserve mass to the tank.
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
	
	static STIFFNESS = 20; // collision circle outward force multiplier. higher number = stronger repulsion
	static MIN_STUMP_MASS = 300; // only makes stumps if core + foliage greater than this
	static PLANT_DECAY_SPEED = 0.08; // lower number = longer lifespan
	static SHORTFALL_DMG_MOD = 15; // damage multiplier for reserve shortfall
	static BASE_SVG_RADIUS = 300; // defines the base SVG dimensions to scale the plant using svg.scale attribute
	static GLOBAL_PLANT_SCALE = 15; // multiplies the area of all plants before determining final radius
	static COSMETIC_FOLIAGE_BUFF = 1.3; // increase visual radius of foliage for better aesthetics even if math is wrong
	static DRAW_FLOWERS = true; // toggle flower rendering. Non-flowers are simple geometric shapes.
	static NEIGHBOR_SHADE_DIV_CONSTANT = 10; // higher num = less impact from neighbors crowding out light
	static MIN_LIGHT_WIDTH = 0.08; // narrowest possible light niche (full specialist)
	static MAX_LIGHT_WIDTH = 0.80; // widest possible light niche (full generalist)
	static LIGHT_NICHE_AREA = 0.60; // conserved gaussian area - adjust if specialists and generalists are not balanced
	static MIN_HEAT_WIDTH = 0.08; // narrowest possible heat niche (full specialist)
	static MAX_HEAT_WIDTH = 0.80; // widest possible heat niche (full generalist)
	static HEAT_NICHE_AREA = 0.60; // conserved gaussian area - adjust if specialists and generalists are not balanced
	static CORE_PHOTOSYNTHESIS_COEF = 0.05; // minor green-stem photosynthesis so leafless plants aren't stuck at zero capacity
	static FRUIT_MAINTENANCE_RATE = 0.0015; // per-tick upkeep tax on banked fruit_credits (rot/spoilage)
	static CORE_MAINTENANCE_RATE = 0.0040;
	static FOLIAGE_MAINTENANCE_RATE = 0.0100;
	static RESERVE_OVERFLOW_TAX_RATE = 0.002; // quadratic carrying cost on reserve banked above max_reserve (tuber-style storage)
	
	constructor(params) {
		// defaults
		this.otype = 4; // numeric type tag for fast checks (1=Boid, 2=Food, 3=Rock, 4=Plant)
		this.oid = ++globalThis.vc.next_object_id;
		this.x = 0;
		this.y = 0;
		this.r = 1;
		this.dna = 128; // random chars
		// this.generation = 1; // cant track through seed DNA unless we append extra data to seeds ;-(
		this.dead = false;
		this.age = 0;
		this.life_credits = 3000; // counts down from
		this.density = 5; // spacial scaler; higher increases plant radius
		this.reserve = 1; // matter stored in core. currency for growth.
		this.mass = 2; // total mass (core + foliage) - mostly for UI, could be factored out?
		this.core = 1; // core mass (roots, branches, trunk, etc)
		this.foliage = 1; // foliage mass. edible. not counted as core mass.
		this.fruit_credits = 0; // counts up from zero
		this.dmg = 0; // accumulated damage, affects health
		this.health = 1.0; // 0..1
		this.svg_scale = 1.0;
		this.svg_linewidth = 2;		
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
		// metrics - used in calculation, but not recorded as fundamental stats. mostly for UI.
		this.metrics = {
			total_growth: 0,
			maintenance: 0,
			priorities_core: 0,
			priorities_foliage: 0,
			priorities_fruit: 0,
			lightEfficiency: 0,
			heatTolerance: 0,
			soilFactor: 0,
			photosyntheticCapacity: 0,
			matterAssimilated: 0,
			neighbor_shade: 0,
			effective_light: 0,
			health_target: 0,
			shortfall: 0,
			eaten: 0,
			damage: 0,
			life_credits_spent: 0,
			excess_returned: 0,
			fruit_threshold: 0,
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
		// assign the next update based on age.
		this.next_update = this.age + Math.random() * 5;
	}
	
	Kill() {
		// return any remaining structural biomass to the environment instead of letting
		// it silently vanish - this is the single choke point every death path funnels through
		// (life credit expiry, core<=0.1, external/predation kills, tank resets).
		// reserve can be a hair negative on some death paths - never turn that into negative waste.
		const leftover_mass = this.core + this.foliage + this.fruit_credits + Math.max( 0, this.reserve );
		if ( leftover_mass > 0 ) {
			globalThis.vc.tank.AddWasteAt( this.x, this.y, leftover_mass );
		}
		this.dead = true;
	}	
	
	// light response peaks at `pref` and falls off on both sides (photoinhibition above is harsher
	// than light-limitation below). `light_peak`/`light_width` are cached genetic terms (see
	// RehydrateFromDNA) that conserve the gaussian's area: narrow niches get a taller peak, wide
	// niches get a shorter one, so specialization is a real tradeoff instead of a free lunch.
	LightEfficiency( light, pref ) {
		const width = ( light > pref ) ? ( 0.5 * this.traits.light_width ) : this.traits.light_width;
		return this.traits.light_peak * Math.exp( -Math.pow( light - pref, 2 ) / ( 2 * Math.pow( width, 2 ) ) );
	}
	
	// returns 0..1
	// heat tolerance is a bell curve that crashes when beyond the plant's preferred temperature.
	// `heat_peak`/`heat_width` are cached genetic terms (see RehydrateFromDNA) that conserve the
	// gaussian's area, same tradeoff mechanism as LightEfficiency: narrow niches (specialists) run
	// taller, wide niches (generalists) run shorter.
	// biology note: plant performance degrades rapidly when ABOVE preferred temperature.
	// the real life curve is asymmetric. use this piecewise hack for cheap compute.
	HeatTolerance( heat, pref ) {
		const width = (heat > pref) ? ( 0.5 * this.traits.heat_width ) : this.traits.heat_width;
		return this.traits.heat_peak * Math.exp( -Math.pow( heat - pref, 2 ) / ( 2 * Math.pow( width, 2 ) ) );
	}
	
	// returns 0..1
	SoilAbsorptionCurve( matter, constant=100 ) {
		return matter / ( matter + constant );
	}

	// reduces life credit, including all known modifier effects
	SpendLifeCredits( x ) {
		const health_factor = 1 + ( 1 - this.health );		
		const credits = x * Plant.PLANT_DECAY_SPEED * health_factor;
		this.life_credits -= credits;
		this.metrics.life_credits_spent += credits;
	}
				
	/*
	This growth model generally works and gives good-enough results. 
	TODO: Major areas of improvement include adding genetic levers for various specializations.
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
		this.next_update = this.age + this.traits.update_freq + ( Math.random() - 0.5 ); // statistically insignificant randomness to avoid visual sync;
		// from here forward, the "delta" is actually the update_freq clock
		delta = this.traits.update_freq;
		
		// reset stats
		for ( const key in this.metrics ) {
			if ( key === 'damage' ) { continue; } // calculated in the rears
			this.metrics[key] = 0;
		}
		
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
		
		// neighbor shade - approximate by simply getting number of plants in my root cell.
		// we're not going down the rabbit hole of calculating overlapping circles.
		const neighbors = globalThis.vc.tank.grid.GetObjectsByCoords( this.x, this.y, o => o.otype===4 && o !== this ).length;
		const neighbor_shade = neighbors / ( neighbors + Plant.NEIGHBOR_SHADE_DIV_CONSTANT );
		this.metrics.neighbor_shade = neighbor_shade;
		
		// plant density adjusts amount of light we can collect - the punishment for being spread out
		// NOTE: density is a size multiplier, so we need to divide here
		const effective_light = ( cell.light / this.density ) * ( 1 - neighbor_shade );
		this.metrics.effective_light = effective_light;
		
		// light response curve - typically a saturating function approaching. 0..1, higher is better
		const lightEfficiency = this.LightEfficiency(effective_light, this.traits.light_pref);
		this.metrics.lightEfficiency = lightEfficiency;
		
		// heat tolerance affects metabolic efficiency. 0..1, higher is better
		const heatTolerance  = this.HeatTolerance(cell.heat, this.traits.heat_pref); 
		this.metrics.heatTolerance = heatTolerance;
		
		// soil absorption: increasingly difficult for roots to find matter.
		// NOTE: using a constant for tuning here, but we could make 
		// poor-soil absorption a genetic trait with fun tradeoffs.
		const soilFactor = this.SoilAbsorptionCurve(cell.matter, 100);
		this.metrics.soilFactor = soilFactor;
		
		// plants grow less dense if they are not getting enough light.
		// this alters effective collision size and needs to mutate slowly over time.
		// max density change is 50% of genetic base.
		// NOTE: density is a mass multiplier, so lower numbers = more compact circle.
		// radius will INCREASE as light DECREASES.
		const target_density = this.traits.density + ( this.traits.density * 0.5 ) * ( 1 - lightEfficiency );
		this.density = ( ( this.density * 5 ) + target_density ) / 6; // hacky


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
		this.metrics.health_target = health;
		this.health = ( this.health + this.health + health ) / 3; // blended result
		this.dmg = 0; // reset - we accumulate damage over the course of time
		this.metrics.damage = 0; // special exception
		

		//====================================================
		// Plant capacities
		//====================================================

		// Leaves collect energy. Represents a max cap on matter we can uptake.
		// light intensity has diminishing returns on photosynthesis.
		// eventually, maintenance outpaces ability to photosynthesize, even with kleiber's discount.
		// core also contributes a small trickle (green stem tissue) so leafless seedlings/stumps
		// are never stuck at zero capacity while they're waiting to grow foliage.
		const photosyntheticCapacity = lightEfficiency * ( 
			Math.pow( this.foliage, 0.5 ) 
			+ Plant.CORE_PHOTOSYNTHESIS_COEF 
			* Math.pow( this.core, 0.5 ) 
			);
		this.metrics.photosyntheticCapacity = photosyntheticCapacity;
		
		// core size limits our storage capacity; this may change with genetic traits.
		const max_reserve = this.core;
		

		//====================================================
		// Matter assimilation
		//====================================================

		// Roots reach every grid cell touched by the plant's radius. The home cell (where the
		// plant is centered) is always fully accessible; other touched cells are weighted by
		// how deep the roots reach into them (see DataGrid.CellsInRadius).
		const cellShares = globalThis.vc.tank.datagrid.CellsInRadius( this.x, this.y, this.r );

		// Pass 1: each cell's unconstrained supply, gated by its own soil quality and matter stock.
		let rawMatterSupply = 0;
		for ( const share of cellShares ) {
			const cellSoilFactor = this.SoilAbsorptionCurve( share.cell.matter, 100 );
			const cellCapacity = share.weight * this.core * cellSoilFactor * heatTolerance;
			share.supply = Math.min( share.cell.matter, delta * cellCapacity );
			rawMatterSupply += share.supply;
		}

		// Pass 2: apply the whole-plant photosynthetic ceiling (Liebig's law), scaling every
		// cell's contribution down proportionally so no single cell gets drained unfairly.
		const matterAssimilated = Math.min( rawMatterSupply, delta * photosyntheticCapacity );
		const supplyScale = rawMatterSupply > 0 ? ( matterAssimilated / rawMatterSupply ) : 0;
		for ( const share of cellShares ) {
			share.cell.matter -= share.supply * supplyScale;
		}
		this.reserve += matterAssimilated;
		this.metrics.matterAssimilated = matterAssimilated;
		

		//====================================================
		// Maintenance costs
		//====================================================
		
		// Fruit maintenance: banked fruit_credits carry their own costs
		const fruitMaint = this.fruit_credits <= 0 ? 0 : 
			Math.min( this.fruit_credits, Plant.FRUIT_MAINTENANCE_RATE * this.fruit_credits * delta );

		// Living tissue continually consumes stored reserve.
		// Larger plants cost more.
		const coreMaint = Plant.CORE_MAINTENANCE_RATE * this.core;
		const foliageMaint = Plant.FOLIAGE_MAINTENANCE_RATE * this.foliage;
		let maint_exponent = 0.75; // kleiber's law - maintenance gets cheaper as plant gets larger
		// heat stress flattens Kleiber's advantage: exponent approaches 1.0 in high heat.
		// this makes larger plants disproportionately more expensive in warm climates.
		maint_exponent = maint_exponent + (cell.heat * 0.15);
		let maintenance = Math.pow( coreMaint + foliageMaint + fruitMaint, maint_exponent ) * delta;
		this.metrics.maintenance = maintenance;
		
		// Respiration and decay returns matter to environment
		this.reserve -= maintenance; // this can go negative! make up shortfall afterwards
		cell.waste += maintenance;

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
			const foliage_priority = 0.7;
			const core_priority = 0.3;
			
			let shortfall = Math.abs(this.reserve);
			this.metrics.total_growth = -shortfall; // note dual purpose stat
			// NOTE: when plants are completely stripped, its a tough spot.
			// Plants should have the ability to get a hail mary and overdrive demand.
			// We already have risk_tolerance, so this is a fine place to use it.
			const demand = shortfall * ( 1 + this.traits.risk_tolerance ) * ( 1 + this.traits.risk_tolerance );
			
			// Fruit: abort fruit in very bad cases. all or nothing decision is made based on
			// severity against risk tolerance. Fruit is dumped into waste.
			if ( this.fruit_credits > 0 ) {
				// severity is scaled against living tissue, not fruit_credits itself - otherwise a
				// big fruit stash would mask its own crisis.
				const severity = shortfall / ( this.mass + 0.01 );
				// fruit close to its ripening threshold is sunk-cost protected: harder to abort
				// the closer it is to paying off (mirrors the threshold math in MakeFruit()).
				const fruit_threshold = this.traits.fruit_num * this.traits.fruit_size *
					Math.sqrt( Math.min( 1.0, this.core / this.traits.fruit_size ) );
				const progress = Math.min( 1, this.fruit_credits / fruit_threshold );
				const threshold = ( 0.3 + 0.7 * this.traits.risk_tolerance ) * ( 0.5 + 0.5 * progress );
				if ( severity > threshold ) {
					globalThis.vc.tank?.AddWasteAt(this.x, this.y, this.fruit_credits);
					this.fruit_credits = 0;
				}
			}
			
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
			// tissue mass converts directly into usable reserve
			this.reserve += foliage_loss + core_loss;
			// shrank to nothing - you died
			if ( this.core <= 0.5 ) {
				this.Kill();
				return;
			}
			
			// the original shortfall counts as damage to the plant indicating "stress"
			this.dmg += shortfall * Plant.SHORTFALL_DMG_MOD;
			this.metrics.damage = this.dmg;
		}

		//====================================================
		// Growth investment
		//====================================================

		else {
			// figure out total growth budget based on risk tolerance and reserve savings
			const saving_target = 100;
			const saving_buffer = 0.05;
			const saving_mod = saving_target * ( saving_buffer + (1 - saving_buffer) * this.traits.risk_tolerance );
			const saving_pct = saving_mod / ( saving_mod + this.reserve );
			const growthBudget = this.reserve * saving_pct;
			this.metrics.growthBudget = growthBudget;
			
			// Allocation growth priorities - blend of genetic factors, environment, and situational necessity
			const priorities = this.CalcGrowthPriorities();
			this.metrics.priorities_core = priorities.core;
			this.metrics.priorities_foliage = priorities.foliage;
			this.metrics.priorities_fruit = priorities.fruit;
						
			// commit growth to all categories
			const growCore = growthBudget * priorities.core;
			const growLeaves = growthBudget * priorities.foliage;
			const growFruit = growthBudget * priorities.fruit;
			this.core     += growCore;
			this.foliage  += growLeaves;
			this.fruit_credits += growFruit;
			const total_growth = growCore + growLeaves + growFruit;
			this.reserve -= total_growth;
			this.metrics.total_growth = total_growth;
			
			// the cost of life is death
			this.SpendLifeCredits( total_growth ) ;
					
			// reserve above capacity isn't clipped outright - core acts as a comfortable baseline,
			// but the plant can bank extra reserve like a tuber. Overflow leaks back to the soil at
			// a quadratically-increasing rate the further past capacity it goes: mild carrying cost
			// near the cap (slack storage), punishing once reserve balloons far beyond it.
			if ( this.reserve > max_reserve ) {
				const overflow = this.reserve - max_reserve;
				const overflow_ratio = overflow / max_reserve;
				const tax = Math.min( overflow, Plant.RESERVE_OVERFLOW_TAX_RATE * overflow * overflow_ratio * delta );
				this.reserve -= tax;
				cell.matter += tax; // return excess to the environment as matter not drawn instead of waste
				this.metrics.excess_returned = tax;
				// overdraft does not count against life credits
			}
			
			// make the fruit with credits we store up
			this.MakeFruit();
		}

		//====================================================
		// Geometry update
		//====================================================

		this.RecalcMassAndSize();
		
	}
	
	// updates combined mass and the collision radius.
	RecalcMassAndSize() {
		// collision physics
		this.mass = this.core + this.foliage;
		this.r = Math.sqrt( this.density * Plant.GLOBAL_PLANT_SCALE * 2 * this.mass / Math.PI );
		this.collision.radius = this.r;
		// cosmetic / display
		const core_radius = Math.sqrt( this.density * Plant.GLOBAL_PLANT_SCALE * 2 * this.core / Math.PI );
		const foliage_radius = this.r - core_radius;
		const scale = this.r / Plant.BASE_SVG_RADIUS;
		const foliage_radius_scaled = foliage_radius / scale;
		this.svg_scale = scale;
		this.svg_linewidth = foliage_radius_scaled * Plant.COSMETIC_FOLIAGE_BUFF;
	}
	
	Export( as_JSON=false ) {
		let output = { classname: 'Plant' };
		// note: next_update and dmg are considered temporal and get ignored. 
		let datakeys = ['x','y','fruit_credits','age','life_credits',
			'mass','health','dna',/* 'generation', */'foliage', 'core', 'reserve', 'density'];
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
		this.RecalcMassAndSize();
		this.metrics.eaten += eaten;
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
		this.metrics.fruit_threshold = threshold;
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
					globalThis.vc.tank.AddWasteAt( this.x, this.y, this.fruit_credits );
				}
				// live fast, die young
				this.SpendLifeCredits( this.traits.fruit_cycle_credit_cost );
				// reset fruiting cycle
				this.fruit_credits = 0;
			}
		}
	}
	
	MakeStump() {
		// must have enough core mass remaining to make it worth rendering
		if ( this.core <= Plant.MIN_STUMP_MASS ) { return; }
		// TODO: should stump lock up matter?
		const r = Math.sqrt( this.density * Plant.GLOBAL_PLANT_SCALE * 2 * this.core / Math.PI ) * 0.88;
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
		// head start on fruit cycle
		const fruit_size = this.traits.fruit_size * this.health;
		const fruit_threshold = this.traits.fruit_num * fruit_size;
		this.fruit_credits = utils.RandomFloat( 0.5 * fruit_threshold, fruit_threshold );
		this.RecalcMassAndSize();
	}	
	
	MakeGeneticColor( whatfor, colors ) {
		let num_colors = Math.round( this.dna.mix( this.dna.genesFor(`plant ${whatfor} num colors gene 2`,2,1), 1, colors.length ) );
		
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
		const fruit_cycles = this.dna.shapedInt( this.dna.genesFor('fruit_cycles',1,1), 1, 100, 50, 6 );
		this.traits.fruit_cycle_credit_cost = this.traits.life_credits / fruit_cycles;
		this.traits.light_pref = this.dna.shapedNumber( this.dna.genesFor('light_pref',2,1), 0, 1 );
		this.traits.light_tolr = this.dna.shapedNumber( this.dna.genesFor('light_tolr',2,1), 0, 1 );
		this.traits.light_width = utils.MapToRange( this.traits.light_tolr, 0, 1, Plant.MIN_LIGHT_WIDTH, Plant.MAX_LIGHT_WIDTH );
		this.traits.light_peak = Math.min( 1.0, Plant.LIGHT_NICHE_AREA / ( this.traits.light_width * Math.sqrt( 2 * Math.PI ) ) );
		this.traits.heat_pref = this.dna.shapedNumber( this.dna.genesFor('heat_pref',2,1), 0, 1 );
		this.traits.heat_tolr = this.dna.shapedNumber( this.dna.genesFor('heat_tolr',2,1), 0, 1 );
		this.traits.heat_width = utils.MapToRange( this.traits.heat_tolr, 0, 1, Plant.MIN_HEAT_WIDTH, Plant.MAX_HEAT_WIDTH );
		this.traits.heat_peak = Math.min( 1.0, Plant.HEAT_NICHE_AREA / ( this.traits.heat_width * Math.sqrt( 2 * Math.PI ) ) );
		this.traits.density = this.dna.shapedNumber( this.dna.genesFor('density',2,1), 0.4, 2.0, 0.7, 2.5 );
		this.density = this.traits.density; // this moves over time with environmental changes
		this.traits.risk_tolerance = this.dna.shapedNumber( this.dna.genesFor('risk_tolerance',2,1), 0, 1 );
		this.traits.point_jitter = this.dna.shapedNumber( this.dna.genesFor('point_jitter',1,1), 0.0, 0.5, 0.05, 2 );
		this.traits.handle_offset_x = this.dna.shapedNumber( this.dna.genesFor('handle_offset_x',1,1), -1, 1, 0.0, 1 );
		this.traits.handle_offset_y = this.dna.shapedNumber( this.dna.genesFor('handle_offset_y',1,1), -1, 1, 0.0, 1 );
		this.traits.cap = this.dna.shapedNumber( this.dna.genesFor('cap',2,1) ) > 0.6 ? 'round' : '';
		// dashes work based on a genetic ramp: higher gene value provides more comb
		const dash_max = Plant.BASE_SVG_RADIUS * 0.1;
		let dash1 = Math.min( 2, Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('dash1',1,1), -dash_max, dash_max, 0, 2 ) ) );
		let dash2 = Math.min( 2, Math.max( 0, this.dna.shapedNumber( this.dna.genesFor('dash2',1,1), -dash_max, dash_max, 0, 2 ) ) );
		if ( dash1 || dash2 ) {
			// minimum to make the partner appear
			dash1 = Math.max( 1, dash1 );
			dash2 = Math.max( 1, dash2 );
			this.traits.dashes = [ dash1, dash2 ];
		}
		this.traits.animation_method = (this.traits.centered && this.traits.discreet) ? 'sway' : 'skew';

				
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
		// don't paint fill and stroke the same color
		if ( this.traits.fill == this.traits.stroke ) {
			this.traits.fill = this.traits.colors[0];
			this.traits.stroke = this.traits.colors[1];
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
		
		//  DATA COLLECTION ----------------\/-------------------
		
		const cell = globalThis.vc.tank.datagrid.CellAt( this.x, this.y );
		
		// Heat: how close are we to preference? 1=near, 0=far
		const heat = this.metrics.heatTolerance;
					
		// Light: how close are we to preference? 1=near, 0=far
		const light = this.metrics.lightEfficiency;
		
		// current foliage to core ratio - can go negative
		const foliage_ratio = 1 - this.foliage / this.core;
		
		// current life credits - use cosine to put 1 in the middle
		const life_credits = 0.5 + 0.5 * Math.cos( ( this.life_credits / this.traits.life_credits ) * Math.PI * 2 + Math.PI );
		
		// enemies: nearby boids that may graze on foliage/fruit (predation pressure).
		// no hard upper limit, so curve to 1.
		let enemies = globalThis.vc.tank.grid.GetObjectsByCoords(this.x, this.y)
			.filter(x => x.otype === 1)
			.length;
		enemies = ( enemies * 0.25 ) / ( ( enemies * 0.25 ) + 1 );
		
		// core development: how big are we?
		const core_dev = 1 - ( this.core * 0.02 ) / ( this.core * 0.02 + 1 );
		
		// recent damage?
		const recent_damage = this.metrics.damage > 0 ? 1 : 0;

		
		// CALCULATE WEIGHTS AND SOFTMAX ----------------\/-------------------
		
		const weights = this.traits.growth_weights;
		const inputs = [ heat, light, foliage_ratio, life_credits, recent_damage, this.metrics.neighbor_shade, enemies, core_dev ];
		const rawScores = [0, 0, 0];

		// Step 1: Accumulate raw scores
		for (let i = 0; i < inputs.length; i++) {
			const signal = inputs[i];
			rawScores[0] += signal * weights[i*3];   // Core
			rawScores[1] += signal * weights[i*3+1]; // Foliage
			rawScores[2] += signal * weights[i*3+2]; // Fruit
		}
	
		// Step 1.1: Emergency override when no foliage
		if ( this.foliage <= 0 ) {
			rawScores[1] = Math.abs(rawScores[1]) + 1;
			rawScores[1] = rawScores[1] * rawScores[1];
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
	
		const t = this.traits; // alias for cleanliness
		
		if ( !Plant.DRAW_FLOWERS ) {
			
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
			this.geo = {
				type:'polygon',
				n: this.traits.food_complexity,
				fill: 'transparent',
				stroke: this.traits.stroke,
				linewidth: this.svg_linewidth,
				r: Plant.BASE_SVG_RADIUS,
				rotation: utils.RandomFloat( 0, Math.PI * 2 ),
			};
			// [!]TECHNICAL: stroke dashes and cap cause serious performance issues			
			// if ( t.dashes ) this.geo.dashes = t.dashes;		
			// if ( t.cap ) this.geo.cap = t.cap;	
			return; 
		}
		
		else {
			// base shape stats
			const radius = Plant.BASE_SVG_RADIUS;
			const radians = Math.PI * 2 / t.food_complexity;
						
			// calculate points
			const jitter = radius * t.point_jitter;
			const points = [];
			for ( let p=0; p < t.food_complexity; p++ ) {
				const angle = p * radians;
				points.push([
					Math.cos(angle) * radius + (Math.random() * jitter - jitter/2),
					Math.sin(angle) * radius + (Math.random() * jitter - jitter/2)
				]);
			}
					
			// create anchors for each point that twist in fun ways.
			// we apply the same handle adjustment to every point, radially.
			const anchors = [];
			const handle_x = radius * t.handle_offset_x;
			const handle_y = radius * t.handle_offset_y;
			for ( let i=0; i < points.length; i++ ) {
				
				// Get the angle of the point based on its x and y
				const angle = Math.atan2( points[i][1], points[i][0] );
				const cos = Math.cos(angle);
				const sin = Math.sin(angle);
				
				// Set base handles relative to anchor
				const h1_start_x = handle_x;
				const h1_start_y = handle_y;
				// second handle mirrors the first - no asymmetry
				const h2_start_x = handle_x;
				const h2_start_y = -handle_y;
				
				// Rotate handle 1 (using original start variables)
				const handle1_x = h1_start_x * cos - h1_start_y * sin;
				const handle1_y = h1_start_x * sin + h1_start_y * cos;
				
				// Rotate handle 2 (using original start variables)
				const handle2_x = h2_start_x * cos - h2_start_y * sin;
				const handle2_y = h2_start_x * sin + h2_start_y * cos;
				
				anchors.push( [
					points[i][0], 
					points[i][1], 
					handle1_x,
					handle1_y,
					handle2_x,
					handle2_y
				] );
				
			}		
				
			// create final shape definition
			const linewidth = Math.sqrt( 2 * this.foliage / Math.PI ) * this.density;
			// const radius = Math.sqrt( 2 * this.mass / Math.PI ) * this.density;		
			let shape = { 
				type: 'path',
				anchors: anchors, // use explicit anchors
				fill: this.traits.fill, // t.fill,
				linewidth: linewidth, // t.linewidth,
				stroke: this.traits.stroke, // t.stroke,
				rotation: utils.RandomFloat( 0, Math.PI * 2 ),
			};
			// [!]TECHNICAL: stroke dashes and cap cause serious performance issues	
			// if ( t.dashes ) shape.dashes = t.dashes;		
			// if ( t.cap ) shape.cap = t.cap;	
				
			this.geo = shape;			
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
	