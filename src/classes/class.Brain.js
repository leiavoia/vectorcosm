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
		// set up correct number of outputs to avoid premature missing index lookups
		this.outputs = new Array( this.type == 'epann' ? this.network.num_outputs : this.network.outputs.length ).fill(0);
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
		const outputs = boid.motors.reduce( (a,c) => a + ( c.neuro ? 1 : 0  ), 0 ); // neuro outputs only

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
			9)  add new neural network output nodes if neuromotors > this.network.num_outputs
			10) remove unused output nodes if neuromotors < this.network.num_outputs (no attempt to maintain alignment)
	*/
	Remap( boid ) {

		if ( this.type === 'epann' ) {
			const epann = this.network;
			
			// Build a clean mapping of sensor labels to input node indexes
			// This ensures the mapping is always in sync with actual network structure
			const newInputMap = {};
			
			// Step 1: Identify which current input nodes correspond to existing sensors
			const sensorToCurrentNode = {};
			const usedNodeIndexes = new Set();
			for (const label of boid.sensor_labels) {
				if (label in this.input_map) {
					const currentIdx = this.input_map[label];
					// Verify the index is still valid
					if (currentIdx < epann.num_inputs && currentIdx >= 0) {
						sensorToCurrentNode[label] = currentIdx;
						usedNodeIndexes.add(currentIdx);
					}
				}
			}
			
			// Step 2: Identify unused input node indexes (can be reused or removed)
			const unusedNodeIndexes = [];
			for (let i = 0; i < epann.num_inputs; i++) {
				if (!usedNodeIndexes.has(i)) {
					unusedNodeIndexes.push(i);
				}
			}
			
			// Step 3: Assign sensors to input nodes, reusing unused indexes where possible
			for (const label of boid.sensor_labels) {
				if (label in sensorToCurrentNode) {
					// Reuse existing mapping
					newInputMap[label] = sensorToCurrentNode[label];
				} 
				else if (unusedNodeIndexes.length > 0) {
					// Reuse an unused node index
					newInputMap[label] = unusedNodeIndexes.shift();
				} 
				else {
					// Add a new input node
					epann.addNode({ layer: 'input' });
					newInputMap[label] = epann.num_inputs - 1;
				}
			}
			
			// Step 4: Remove input nodes that are no longer needed
			// Mark nodes for removal by collecting indexes not in the new mapping
			const nodesToKeep = new Set(Object.values(newInputMap));
			for (let i = epann.num_inputs - 1; i >= 0; i--) {
				if (!nodesToKeep.has(i)) {
					epann.removeNode(i, true);
					// Update all mapping entries for higher indexes
					for (const label in newInputMap) {
						if (newInputMap[label] > i) {
							newInputMap[label]--;
						}
					}
				}
			}
			
			// Step 5: Reorder input nodes to align with sensor_labels order (0..N-1)
			// Build desired order mapping
			const desiredOrder = {};
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				desiredOrder[boid.sensor_labels[i]] = i;
			}
			
			// Reorder via swaps from front to back
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				const label = boid.sensor_labels[i];
				const currentIdx = newInputMap[label];
				if (currentIdx !== i) {
					// Swap nodes at positions i and currentIdx
					const tmp = epann.nodes[i];
					epann.nodes[i] = epann.nodes[currentIdx];
					epann.nodes[currentIdx] = tmp;
					// Update mapping: any other sensor at position i moves to currentIdx
					for (const otherLabel in newInputMap) {
						if (newInputMap[otherLabel] === i) {
							newInputMap[otherLabel] = currentIdx;
						} 
						else if (newInputMap[otherLabel] === currentIdx) {
							newInputMap[otherLabel] = i;
						}
					}
				}
			}
			
			// Step 6: Finalize input map (ensure clean 0..N-1 indexing)
			this.input_map = {};
			for (let i = 0; i < boid.sensor_labels.length; i++) {
				this.input_map[boid.sensor_labels[i]] = i;
			}

			// Step 8: Add new neural network output nodes if neuromotors > this.network.num_outputs
			const neuromotors = boid.motors.reduce( (a,c) => a + ( c.neuro ? 1 : 0  ), 0 );
			while (neuromotors > epann.num_outputs) {
				epann.addNode({ layer: 'output' });
			}

			// Step 9: Remove unused output nodes if neuromotors < this.network.num_outputs
			while (neuromotors < epann.num_outputs) {
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
			
			// Build a mapping of sensor label -> node index (reusing existing connections when possible)
			const newInputMap = {};
			const newInputs = [];
			
			// Step 1: Preserve mappings for sensors that still exist
			const mappedNodeIndexes = new Set();
			for (const label of boid.sensor_labels) {
				if (label in this.input_map) {
					const oldInputIndex = this.input_map[label];
					const nodeIndex = snn.inputs[oldInputIndex];
					if (typeof nodeIndex !== 'undefined') {
						// Reuse existing node connection
						newInputMap[label] = newInputs.length;
						newInputs.push(nodeIndex);
						mappedNodeIndexes.add(nodeIndex);
					}
				}
			}
			
			// Step 2: Find unused node connections from old inputs
			const unusedNodeIndexes = [];
			for (let i = 0; i < snn.inputs.length; i++) {
				if (!mappedNodeIndexes.has(snn.inputs[i])) {
					unusedNodeIndexes.push(snn.inputs[i]);
				}
			}
			
			// Step 3: Assign new sensors to unused node connections or create new ones
			for (const label of boid.sensor_labels) {
				if (!(label in newInputMap)) {
					let nodeIndex;
					if (unusedNodeIndexes.length > 0) {
						nodeIndex = unusedNodeIndexes.shift();
					}
					else {
						nodeIndex = Math.floor(Math.random() * Math.max(1, snn.nodes.length));
					}
					newInputMap[label] = newInputs.length;
					newInputs.push(nodeIndex);
				}
			}
			
			// Step 4: Apply the new inputs and map atomically
			snn.inputs = newInputs;
			this.input_map = newInputMap;
			
			// Step 8: Add new output nodes if neuromotors > snn.outputs.length
			const neuromotors = boid.motors.reduce( (a,c) => a + ( c.neuro ? 1 : 0  ), 0 );
			while (neuromotors > snn.outputs.length) {
				snn.CreateRandomOutputNode();
			}
			
			// Step 9: Remove unused output nodes if neuromotors < snn.outputs.length
			while (neuromotors < snn.outputs.length) {
				snn.outputs.pop();
			}
			
			// Validate all node indexes in snn.inputs are valid
			for (let i = 0; i < snn.inputs.length; i++) {
				if (snn.inputs[i] < 0 || snn.inputs[i] >= snn.nodes.length || typeof(snn.nodes[snn.inputs[i]]) === 'undefined' ) {
					console.error(`SNN.Remap invalid input index:`, snn.nodes, snn.inputs);
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
