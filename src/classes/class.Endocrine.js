/* <AI>
Endocrine — hormone system that modulates boid behavior over slow timescales.

OVERVIEW
- 4 inputs, 4 hormones (configurable at construction).
- Inputs represent environmental signals (e.g. energy, threat, hunger).
- Hormones converge toward a target determined by weighted input sums + hormone cross-effects.
- In Boid: hormones modulate sensor gain (DOPE_SENSORS) and motor power (DOPE_MOTORS).

UPDATE MODEL (each call to `update(inputs[])`)
  1. Sum weighted inputs → pressure  (matrix: inputs × weights[h × num_inputs + i])
  2. Add hormone cross-effects        (matrix: hormones × crossWeights[h × num_hormones + k])
  3. Nonlinearity: target = 0.5 + 0.5 * tanh(pressure)
  4. Lerp each hormone toward target at `rates[h]` speed

DNA ENCODING
- `dna_pos` starts from a DNA-derived address (`genesFor('endocrine dna read start')`).
- Sequential 2-char reads fill weights, crossWeights, and rates in order.
- First 4 chars of DNA act as a scramble seed, keeping the read pattern stable under mutation.

HORMONE GUIDE (not rigidly enforced)
  0: Awareness  1: Decision  2: Action  3: Wildcard
</AI> */

import DNA from '../classes/class.DNA.js'

const GLOBAL_HORMONE_THROTTLE = 1.0;
const HORMONE_BASE_LEVEL = 0.25;

export default class Endocrine {
	
	constructor({num_inputs = 4, num_hormones = 4, dna = null }) {
		// if DNA is being supplied, we can mine that for data.
		// otherwise we have to set weights and rates with random numbers.
		// DNA is read in a simplistic way to reduce CPU time. 
		// we start from a position in DNA and just read sequential chunks.
		// starting position is also DNA controlled and may change through mutation
		let dna_pos = 0; // increments as we read
		if ( dna ) {
			const genes = dna.genesFor('endocrine dna read start', 3, 2);
			dna_pos = Math.trunc( dna.mix(genes, 0, 2048) );
		}
		let randomDNAValue = () => {
			if ( dna ) {
				// 2-char reads -> provides 0..256 value range - good enough
				// 1-char skip size provides read variety.
				dna_pos = dna_pos % 0xFFFF; // stay in the valid range
				// console.log(dna_pos);
				const gene = 0x02010000 | dna_pos;
				dna_pos += 3;
				return dna.read(gene, 0, 1); 
			}
			return Math.random();
		}
		
		// basic settings
		this.num_inputs = num_inputs;
		this.num_hormones = num_hormones;
		// starting random conditions
		this.hormones = Array.from({length: num_hormones}, () => HORMONE_BASE_LEVEL);
		this.inputs = Array.from({length: num_inputs}, () => 0);
		// hormone-input weights (flattened multidimensional array)
		this.weights = Array.from({length: num_hormones * num_inputs}, () => ( randomDNAValue() - 0.5 ) * 2 );
		// hormone-hormone crossWeights (flattened multidimensional array)
		this.crossWeights = Array.from({length: num_hormones * num_hormones}, () => ( randomDNAValue() - 0.5 ) * 2 );
		this.rates = Array.from({length: num_hormones}, () => 0.12 + randomDNAValue() * 0.3);
		// having a single "rates" array simplifies the situation. As a more interesting alternative:
		// consider having separate growth and decay rates.
		// this.growthRates = Array.from({length: num_hormones}, () => 0.05 + Math.random() * 0.10);
		// this.decayRates = Array.from({length: num_hormones}, () => 0.02 + Math.random() * 0.05);
		this.tick = 0; // tracks number of updates
	}
	
	// takes environmental input values to influence hormone changes
	// number of inputs in array should correspond to the number inputs
	// requested from class was created (this.num_inputs)
	update( inputs ) {
		
		for ( let i = 0; i < this.num_inputs; ++i ) {
			this.inputs[ i ] = inputs[ i ] ?? this.inputs[ i ];
		}
		
		const newHormones = new Array(this.num_hormones);
		
		for (let h = 0; h < this.num_hormones; ++h) {
			// 1. Calculate Net Pressure (Inputs + Cross-effects)
			let pressure = 0;
			for (let i = 0; i < this.num_inputs; ++i) {
				pressure += this.inputs[i] * this.weights[h * this.num_inputs + i];
			}
			for (let k = 0; k < this.num_hormones; ++k) {
				pressure += this.hormones[k] * this.crossWeights[h * this.num_hormones + k];
			}

			// 2. The "Target" Calculation
			// Note: 0.5 is the "zero pressure" baseline.
			// We might want 0.0 to be the baseline. If so, switch to sigmoid:
			// 1 / (1 + Math.exp(-x))
			let nonLinearPressure = 0.5 + 0.5 * Math.tanh(pressure);
			
			// 3. Target-Seeking Logic
			// Instead of calculating growth and decay as independent forces,
			// we find the gap between current state and target state.
			let difference = nonLinearPressure - this.hormones[h];

			// Pick the appropriate rate based on whether we are rising or falling.
			// This preserves your per-hormone personality (e.g., fast rise, slow fall).
			// let currentRate = (difference > 0) ? this.growthRates[h] : this.decayRates[h];
			let currentRate = this.rates[h];

			// 4. Update with Global Rate
			// The delta is now proportional to the distance from the target.
			// As you get closer, the delta shrinks to 0.
			let delta = difference * currentRate * GLOBAL_HORMONE_THROTTLE;
			
			let next = this.hormones[h] + delta;
			newHormones[h] = Math.max(0, Math.min(1, next));
		}
		
		// write back instead of swap to reduce memory thrashing
		for ( let i=0; i < newHormones.length; i++ ) {
			this.hormones[i] = newHormones[i];
		}
		
		this.tick++;
	}
		
	Reset() {
		for ( let i=0; i < this.hormones.length; i++ ) {
			this.hormones[i] = HORMONE_BASE_LEVEL;
		}
	}		
}
	