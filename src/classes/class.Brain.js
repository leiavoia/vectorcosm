import SpikingNeuralNetwork from './class.SpikingNeuralNetwork.js';
import EPANN from './class.EPANN.js';
import * as utils from '../util/utils.js';

export default class Brain {

	// params, one of: 
	//	boid
	//	brain
	//	json
	constructor( params ) {
		// setup
		this.type = 'epann';
		this.network = null;
		this.outputs = [];
		this.input_map = {};
		this.last_update = 0;		
		// existing brain object - copy properties over
		if ( params?.brain ) {
			params.json = params.brain.toJSON(); 
		}
		// literal json of entire Brain including network
		if ( params?.json ) {
			const pod = typeof(params.json)==='string' ? JSON.parse(params.json) : params.json; // string or POD
			Object.assign(this,pod);
			// inflate create the network
			if ( pod.type === 'snn' ) {			
				let snn = new SpikingNeuralNetwork();
				snn.Import(this.network);
				this.network = snn;
			}
			else if ( pod.type === 'epann' ) {			
				let net = new EPANN();
				net.Import(this.network);
				this.network = net;
			}
		}
		// create a new network from boid DNA
		else if ( params?.boid ) {
			// just ignore the boid for now. we dont do anything with boid DNA
			this.network = this.MakeBrain( params.boid );
			// save the input map so we can compare against future mutations
			this.input_map = {};
			for ( let i=0; i < params.boid.sensor_labels.length; i++ ) {
				const label = params.boid.sensor_labels[i];
				if ( label in this.input_map ) { console.warn(`Non-unique sensor label ${label} will cause brain damage.`); }
				this.input_map[label] = i;
			}
		}
	}
	
	// works the network, and outputs outputs to "outputs"
	Activate( inputs, timestamp ) {
		// SSN
		if ( this.type==='snn' ) {
			const tick_interval = 1/120;
			// start the clock
			if ( !this.last_update || this.last_update > timestamp ) { // indicates first tick
				this.last_update = timestamp - tick_interval; // one free tick
			} 
			// don't allow overly long deltas
			else if ( timestamp - this.last_update > 0.25 ) {
				this.last_update = timestamp - 0.25;
			}
			// don't allow artificial ticks on short time intervals.
			// if elapsed time hasn't arrived, do nothing. wait for the next round.
			while ( this.last_update + tick_interval < timestamp ) {
				this.network.Tick( inputs ); // case
				this.last_update += tick_interval;
			}
			this.network.CalculateOutputs();
			if ( !this.outputs.length ) {
				this.outputs = this.network.outputs.map( o => o.output );
			}
			else { 
				let net_outputs = this.network.outputs;
				for ( let i=0; i < net_outputs.length; i++ ) {
					this.outputs[i] = net_outputs[i].output; // so many outputs in my output!
					if ( Number.isNaN(this.outputs[i]) ) { this.outputs[i] = 0; }
				}
			}
		}
		// // RNN
		// else if ( this.type==='rnn' ) {
		// 	// TODO: add actual timer
		// 	this.outputs = this.network.activate( inputs, 1/60 );
		// }
		// EPANN
		else if ( this.type==='epann' ) {
			this.outputs = this.network.Activate( inputs );
		}
		return this.outputs;
	}
	
	Export(asJSON=true) {
		let network = this.network.Export(false); // as object
		const obj = {
			type: this.type,
			input_map: this.input_map,
			network: network
		};
		return asJSON ? JSON.stringify(obj) : obj;
	}
	
	static Import( json ) { /* JSON string or raw object */
		const from = (typeof json === 'string') ? JSON.parse(json) : json;	
		return new Brain({json:from});
	}
	
	toJSON() {
		return this.Export(true);
	}
	
	static fromJSON(json) {
		return Brain.Import(json);
	}
	
	MakeBrain( boid ) {
		
		const inputs = boid.sensor_labels.length;
		const outputs = boid.motors.length || 1;

		// determine what kind of brain network we are going to make first
		// NOTE: gene codes are copied in Boid sensor creation to avoid chicken/egg issues.
		// SNNs require special pulse "sensors", but we need to know sensor layout before making brains.
		const network_type_roll = boid.dna.shapedNumber( boid.dna.genesFor('brain network type',3), 0, 1, 0.5, 2 );
		this.type = 'epann';
		if ( network_type_roll < 0.25 || network_type_roll > 0.75 ) {
			this.type = 'snn';
		}
		
		if ( this.type==='snn' ) {
			// how many nodes to start with
			const num_node_mult = boid.dna.shapedNumber( boid.dna.genesFor('num_node_mult',3), 1.5, 5, 2.5, 3 );
			const nodes = inputs * num_node_mult + outputs;
			// connectivity pattern [NOT IMPLEMENTED YET]
			const conn_pattern_roll = boid.dna.shapedNumber( boid.dna.genesFor('conn_pattern_roll',3) );
			let pattern = 'random';
			if ( conn_pattern_roll < 0.5 ) { pattern = 'linear'; }
			if ( conn_pattern_roll < 0.3 ) { pattern = 'cellular'; }
			// commit
			let snn = new SpikingNeuralNetwork( nodes, inputs, outputs );
			return snn;
		}
		
		else if ( this.type==='epann' ) {
			const respect_layers = Math.random() > 0.5;
			// start with a small number of middles and more direct-to-output connections
			let middles = Math.round( Math.random() * inputs / 2 ) + Math.ceil( inputs / 4 );
			// we want some cases with extremely simple linear systems to start with
			if ( !respect_layers && Math.random() > 0.65  ) {
				middles = 0;
			}
			const connectivity = utils.RandomFloat( 0.3, 0.7 );
			const net = new EPANN({
				max_logs:0, 
				respect_layers
			});
			net.Lobotomize(inputs, middles, outputs, connectivity );
			return net;
		}
	}
		
	Mutate( iterations=1 ) {
		this.network.Mutate(iterations);
		return this;
	}

	/*
		rewire the brain as needed to rectify current input map with boid's current sensor labels.
		this.input_map maps sensors to neural network input nodes.
		it is important that association between sensors and input nodes remain
		intact after mutations to either sensors available or brain structure.
		otherwise we get mixed signals and learning is difficult. 
		input_map is an object with string keys corresponding to sensor labels.
		the value is the index into the brain's node array (epann) or inputs array (snn). 
		this function will:
			1)  find input_map entries that are no longer needed (sensor no longer exists) 
			2)  find which neural network node indexes are currently unused (disconnected, previous sensor is gone)
			3)  find sensors that do not currently correspond to a neural network node index (sensor is new)
			4)  connect new sensors to old, unused node indexes if any exist (reuse existing input nodes instead of making new ones)
			5)  create new input nodes for unmapped sensors that we could not reassign to an existing input node
			6)  remove existing input nodes that could not be filled
			7)  physically reorder the input nodes to align with the expected sensor outputs.
			8)  recreate the input map
			9)  add new neural network output nodes if boid.motors.length > this.network.num_outputs
			10) remove unused output nodes if boid.motors.length < this.network.num_outputs (no attempt to maintain alignment)
	*/
	Remap( boid ) {

		if ( this.type === 'epann' ) {
			const epann = this.network;
			
			// Step 1: Find input_map entries that are no longer needed (sensor no longer exists)
			const currentSensors = new Set(boid.sensor_labels);
			const unusedInputIndexes = [];
			for (const [label, index] of Object.entries(this.input_map)) {
				if (!currentSensors.has(label)) {
					unusedInputIndexes.push(index);
					delete this.input_map[label];
				}
			}

			// Step 2: Find sensors that do not currently correspond to a neural network node index (sensor is new)
			const unmappedSensors = boid.sensor_labels.filter(label => !(label in this.input_map));

			// Step 3: Reuse existing input nodes for unmapped sensors if possible
			for (const sensor of unmappedSensors) {
				if (unusedInputIndexes.length > 0) {
					const reusedIndex = unusedInputIndexes.shift();
					this.input_map[sensor] = reusedIndex;
				}
			}

			// Step 4: Create new input nodes for unmapped sensors that could not be reassigned
			for (const sensor of unmappedSensors) {
				if (!(sensor in this.input_map)) {
					// Add input node at the end of input section
					epann.addNode({ layer: 'input' });
					this.input_map[sensor] = epann.num_inputs - 1;
				}
			}

			// Step 5: Remove existing input nodes that could not be filled
			// Find all input node indexes in the network
			const mappedIndexes = new Set(Object.values(this.input_map));
			// Remove input nodes not mapped to any sensor, from highest to lowest index
			for (let i = epann.num_inputs - 1; i >= 0; i--) {
				if (!mappedIndexes.has(i)) {
					epann.removeNode(i, true);
					// After removal, all higher indexes shift down by 1, so update input_map
					for (const label in this.input_map) {
						if (this.input_map[label] > i) {
							this.input_map[label]--;
						}
					}
				}
			}

			// Step 6: Physically reorder the input nodes to align with the expected sensor outputs
			// If the order is already correct, skip. Otherwise, reorder.
			// Build desired order
			let needsReorder = false;
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				if (this.input_map[boid.sensor_labels[i]] !== i) {
					needsReorder = true;
					break;
				}
			}
			if (needsReorder) {
				// For each sensor, if its mapped index is not at the right spot, swap nodes
				for (let i = 0; i < boid.sensor_labels.length; i++) {
					const label = boid.sensor_labels[i];
					const currentIdx = this.input_map[label];
					if (currentIdx !== i) {
						// Swap node at i with node at currentIdx
						const tmp = epann.nodes[i];
						epann.nodes[i] = epann.nodes[currentIdx];
						epann.nodes[currentIdx] = tmp;
						// Update all input_map entries that pointed to i or currentIdx
						for (const l in this.input_map) {
							if (this.input_map[l] === i) this.input_map[l] = currentIdx;
							else if (this.input_map[l] === currentIdx) this.input_map[l] = i;
						}
					}
				}
			}

			// Step 7: Recreate the input map (ensure 0..N-1 order)
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				this.input_map[boid.sensor_labels[i]] = i;
			}

			// Step 8: Add new neural network output nodes if boid.motors.length > this.network.num_outputs
			while (boid.motors.length > epann.num_outputs) {
				epann.addNode({ layer: 'output' });
			}

			// Step 9: Remove unused output nodes if boid.motors.length < this.network.num_outputs
			while (boid.motors.length < epann.num_outputs) {
				// Remove last output node
				epann.removeNode(epann.nodes.length - 1, true);
			}
			
			// final audit
			let num_inputs = this.network.num_inputs;
			let num_senses = boid.sensor_labels.length;
			if ( num_inputs != num_senses ) { 
				const map_keys = Object.keys(this.input_map).length;
				console.error(`EPANN.Remap misalignment: SENSE=${num_senses}, NODES=${num_inputs}, MAP=${map_keys}`); 
			}	
							
		} 
	
		else if (this.type === 'snn') {
			const snn = this.network;
			
			// Step 1: Find input_map entries that are no longer needed (sensor no longer exists)
			const currentSensors = new Set(boid.sensor_labels);
			const unusedInputIndexes = [];
			for (const [label, index] of Object.entries(this.input_map)) {
				if (!currentSensors.has(label)) {
					unusedInputIndexes.push(index);
					delete this.input_map[label];
				}
			}
			
			// Step 2: Find sensors that do not currently correspond to input_map (sensor is new)
			const unmappedSensors = boid.sensor_labels.filter(label => !(label in this.input_map));
			
			// Step 3: Reuse existing input array indexes for unmapped sensors if possible
			for (const sensor of unmappedSensors) {
				if (unusedInputIndexes.length > 0) {
					const reusedIndex = unusedInputIndexes.shift();
					this.input_map[sensor] = reusedIndex;
				}
			}
			
			// Step 4: Create new input array entries for unmapped sensors that could not be reassigned
			for (const sensor of unmappedSensors) {
				if (!(sensor in this.input_map)) {
					const inputIndex = snn.inputs.length;
					const nodeIndex = Math.floor(Math.random() * Math.max(1, snn.nodes.length));
					snn.inputs.push(nodeIndex);
					this.input_map[sensor] = inputIndex;
				}
			}
			
			// Step 5: Remove extra input entries if sensors were reduced
			while (snn.inputs.length > boid.sensor_labels.length) {
				snn.inputs.pop();
			}
			
			// Step 6: Physically reorder inputs to align with sensor_labels order
			const newInputs = new Array(boid.sensor_labels.length);
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				const label = boid.sensor_labels[i];
				const oldInputIndex = this.input_map[label];
				newInputs[i] = snn.inputs[oldInputIndex];
			}
			snn.inputs = newInputs;
			
			// Step 7: Recreate input_map (ensure 0..N-1 order)
			this.input_map = {};
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				this.input_map[boid.sensor_labels[i]] = i;
			}
			
			// Step 8: Add new output nodes if boid.motors.length > snn.outputs.length
			while (boid.motors.length > snn.outputs.length) {
				snn.CreateRandomOutputNode();
			}
			
			// Step 9: Remove unused output nodes if boid.motors.length < snn.outputs.length
			while (boid.motors.length < snn.outputs.length) {
				snn.outputs.pop();
			}
			
			// Validate all node indexes in snn.inputs are valid
			for (let i = 0; i < snn.inputs.length; i++) {
				if (snn.inputs[i] < 0 || snn.inputs[i] >= snn.nodes.length) {
					snn.inputs[i] = Math.floor(Math.random() * Math.max(1, snn.nodes.length));
				}
			}

			// final audit
			let num_inputs = this.network.inputs.length;
			let num_senses = boid.sensor_labels.length;
			if (num_inputs !== num_senses) {
				const map_keys = Object.keys(this.input_map).length;
				console.error(`SNN.Remap misalignment: SENSE=${num_senses}, NODES=${num_inputs}, MAP=${map_keys}`);
			}
		}
		
		return this;
	}
	Reset() {
		this.last_update = 0;
		if ( 'Reset' in this.network ) { 
			this.network.Reset();
		}
	}
}
