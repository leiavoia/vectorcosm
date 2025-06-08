import neataptic from "neataptic";
const { architect, Network } = neataptic;
import SpikingNeuralNetwork from './class.SpikingNeuralNetwork.js';
import * as utils from '../util/utils.js';

export default class Brain {

	static mutationOptionPicker = new utils.RandomPicker( [
		[ neataptic.methods.mutation.ADD_NODE, 			16 ],
		[ neataptic.methods.mutation.SUB_NODE, 			20 ],
		[ neataptic.methods.mutation.ADD_CONN, 			34 ],
		[ neataptic.methods.mutation.SUB_CONN, 			40 ],
		[ neataptic.methods.mutation.MOD_WEIGHT, 		1000 ],
		[ neataptic.methods.mutation.MOD_BIAS, 			100 ],
		[ neataptic.methods.mutation.MOD_ACTIVATION, 	15 ],
		[ neataptic.methods.mutation.ADD_GATE, 			10 ],
		[ neataptic.methods.mutation.SUB_GATE, 			10 ],
		[ neataptic.methods.mutation.ADD_SELF_CONN, 	10 ],
		[ neataptic.methods.mutation.SUB_SELF_CONN, 	10 ],
		[ neataptic.methods.mutation.ADD_BACK_CONN, 	10 ],
		[ neataptic.methods.mutation.SUB_BACK_CONN, 	10 ],
		[ neataptic.methods.mutation.SWAP_NODES, 		12 ],
	] );
	
	// params, one of: 
	//	boid
	//	brain
	//	json
	constructor( params ) {
		// setup
		this.type = 'snn';
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
			else {
				this.network = neataptic.Network.fromJSON(this.network); // poorly named function processes POD, not JSON
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
			const tick_interval = 1/60;
			// start the clock
			if ( !this.last_update ) { 
				this.last_update = timestamp - tick_interval; // one free tick
			} 
			// don't allow overly long deltas
			else if ( timestamp - this.last_update > 0.5 ) {
				this.last_update = timestamp - 0.5;
			}
			// don't allow artificial ticks on short time intervals.
			// if elapsed time hasn't arrived, do nothing. wait for the next round.
			while ( this.last_update + tick_interval < timestamp ) {
				this.network.Tick( inputs ); // case
				this.network.CalculateOutputs(); // maybe optimize this out by doing only once?
				this.last_update += tick_interval;
			}
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
		// Neataptic
		else {
			this.outputs = this.network.activate( inputs );
			for ( let k in this.outputs ) {
				if ( Number.isNaN(this.outputs[k]) ) { this.outputs[k] = 0; }
			}
		}
		return this.outputs;
	}
	
	toJSON() {
		let network = this.type==='snn' 
			? this.network.Export(false) // as object
			: this.network.toJSON(); // misnomor, its not actually JSON, its POD object
		return JSON.stringify({
			type: this.type,
			input_map: this.input_map,
			network: network
		});
	}
	
	static fromJSON(json) {
		let brain = new Brain({json:json});
		return brain;
	}
	
	MakeBrain( boid ) {
		
		const inputs = boid.sensor_labels.length;
		const outputs = boid.motors.length || 1;

		// determine what kind of brain network we are going to make first
		// NOTE: gene codes are copied in Boid sensor creation to avoid chicken/egg issues.
		// SNNs require special pulse "sensors", but we need to know sensor layout before making brains.
		const network_type_roll = boid.dna.shapedNumber( boid.dna.genesFor('brain network type',3), 0, 1, 0.5, 2 );
		this.type = ( network_type_roll < 0.25 || network_type_roll > 0.75 ) ? 'snn' : 'perceptron';
		
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
		
		else {
			const act_picker = new utils.RandomPicker( [
				[neataptic.methods.activation.LOGISTIC, 300],
				[neataptic.methods.activation.TANH, 100],
				[neataptic.methods.activation.IDENTITY, 2],
				[neataptic.methods.activation.STEP, 5],
				[neataptic.methods.activation.RELU, 200],
				[neataptic.methods.activation.SOFTSIGN, 10],
				[neataptic.methods.activation.SINUSOID, 8],
				[neataptic.methods.activation.GAUSSIAN, 8],
				[neataptic.methods.activation.BENT_IDENTITY, 2],
				[neataptic.methods.activation.BIPOLAR, 4],
				[neataptic.methods.activation.BIPOLAR_SIGMOID, 6],
				[neataptic.methods.activation.HARD_TANH, 8],
				[neataptic.methods.activation.ABSOLUTE, 2],
				[neataptic.methods.activation.INVERSE, 2],
				[neataptic.methods.activation.SELU, 15],
			]);
			
			// threshold to determine if a node exists at all
			const num_node_threshold = boid.dna.shapedNumber( boid.dna.genesFor('num_node_threshold',3), 0.05, 0.5, 0.28, 2 );
			// threshold to determine if a connection between two nodes is made
			const connectivity = boid.dna.shapedNumber( boid.dna.genesFor('connectivity',3), 0.2, 0.6, 0.33, 2 );
			
			const hasNode = gene_str => {
				return boid.dna.mix( boid.dna.genesFor(gene_str, 3), 0, 1 ) < num_node_threshold;
			};
			const geneConnect = gene_str => {
				return boid.dna.read( boid.dna.genesFor(gene_str), 0, 1 ) > connectivity;
			};
			const geneWeight = gene_str => {
				return boid.dna.read( boid.dna.genesFor(gene_str), -1, 1 );
			};
			
			let output_nodes = [];
			let input_nodes = [];
			let middle_nodes = [];
			for ( let i=0; i < inputs; i++ ) {
				input_nodes.push( new neataptic.Node('input') );
			}
			for ( let i=0; i < outputs; i++ ) {
				output_nodes.push( new neataptic.Node('output') );
			}
			for ( let i=0; i < 20; i++ ) { // MAGIC
				if ( hasNode(`has m node ${i}`) ) {
					let n = new neataptic.Node('hidden');
					n.squash = act_picker.Pick( boid.dna.shapedNumber( boid.dna.genesFor(`m node ${i} act`) ) );
					n.bias = geneWeight(`m node ${i} bias`);
					middle_nodes.push( n );
				}
			}
			// input connections
			for ( let [i_index, i] of input_nodes.entries() ) {
				// inputs to middles
				for ( let [m_index, m] of middle_nodes.entries() ) {
					if ( geneConnect(`conn i${i_index}-m${m_index}`) ) {
						i.connect(m, geneWeight(`conn i${i_index}-m${m_index} weight`) );	
					}
				}
				// inputs to outputs
				for ( let [o_index, o] of output_nodes.entries() ) {
					if ( geneConnect(`conn i${i_index}-o${o_index}`) ) {
						i.connect(o, geneWeight(`conn i${i_index}-o${o_index} weight`) );	
					}
				}
			}
			// middle to outputs
			for ( let [m_index, m] of middle_nodes.entries() ) {
				for ( let [o_index, o] of output_nodes.entries() ) {
					if ( geneConnect(`conn m${m_index}-o${o_index}`) ) {
						m.connect(o, geneWeight(`conn m${m_index}-o${o_index} weight`) );	
					}
				}
			}
			// middles to other middles
			for ( let i=0; i < middle_nodes.length; i++ ) {
				for ( let j=i+1; j < middle_nodes.length; j++ ) {
					if ( geneConnect(`conn m${i}-m${j}`) ) {
						middle_nodes[i].connect(middle_nodes[j], geneWeight(`conn m${i}-m${j} weight`) );	
					}
				}
			}
			// connect inputs that are not well connected
			for ( let i=input_nodes.length-1; i>=0; i-- ) {
				if ( !input_nodes[i].connections.out.length ) {
					// input to all middles
					for ( let [m_index, m] of middle_nodes.entries() ) {
						input_nodes[i].connect(m, geneWeight(`conn i${i}-m${m_index} weight`) );	
					}			
					// input to all outputs
					for ( let [o_index, o] of output_nodes.entries() ) {
						input_nodes[i].connect(o, geneWeight(`conn i${i}-o${o_index} weight`) );	
					}			
				}
			}
			// connect outputs that are not well connected
			for ( let o=output_nodes.length-1; o>=0; o-- ) {
				if ( !output_nodes[o].connections.in.length ) {
					// output to all middles
					for ( let [m_index, m] of middle_nodes.entries() ) {
						m.connect(output_nodes[o], geneWeight(`conn o${o}-m${m_index} weight`) );	
					}			
					// output to all inputs
					for ( let [i_index, i] of input_nodes.entries() ) {
						i.connect(output_nodes[o], geneWeight(`conn o${o}-i${i_index} weight`) );	
					}			
				}
			}
			// connect middle nodes that are not well connected
			for ( let i=middle_nodes.length-1; i>=0; i-- ) {
				if ( !middle_nodes[i].connections.in.length ) {
					const n = input_nodes[ i % input_nodes.length ];
					const w = geneWeight(`conn m${i} makeup weight`);
					n.connect(middle_nodes[i], w);
				}
				if ( !middle_nodes[i].connections.out.length ) {
					middle_nodes[i].connect(output_nodes[ i % output_nodes.length ], geneWeight(`conn m${i} makeup weight`));
				}
			}
			
			return architect.Construct( input_nodes.concat( middle_nodes, output_nodes ) );
		}
	}
		
	Mutate( iterations=1 ) {
		if ( this.type==='snn' ) {
			this.network.Mutate(iterations);
		}
		else {
			for ( let n=0; n < iterations; n++ ) { 
				this.network.mutate( Brain.mutationOptionPicker.Pick() );
			}
			// Neataptic can alter output node bias. We don't want this.
			// This resets output node bias to zero. letting it run amok
			// can lead to "locked in" brain outputs that never change. 
			// You might specifically want it back someday, but not today.
			this.network.nodes.filter(n=>n.type=='output').forEach(n => n.bias = 0 );
		}
		return this;
	}
	
	// rewire the brain as needed to rectify current input map with boid's current sensor labels.
	Remap( boid ) {
	
		// 0) Find map entries we no longer have
		const unused_map_entries = Object.keys(this.input_map).filter( x => !boid.sensor_labels.includes(x) );
		
		// 1) Find unused indexes
		const unused_indexes = unused_map_entries.map( x => this.input_map[x] );
		
		// 2) remove unused entries
		if ( unused_map_entries.length ) { 
			for ( let l of unused_map_entries ) {
				delete(this.input_map[l]);
			}
		}
		
		// 3) Find sensors not currently mapped
		const unmapped_sensors = boid.sensor_labels.filter( x => !(x in this.input_map) );
		
		// 4) Fill gaps in unmapped sensors -> unused indexes
		while ( unmapped_sensors.length && unused_indexes.length ) {
			let next_sensor = unmapped_sensors.shift();
			let next_index = unused_indexes.shift();
			this.input_map[next_sensor] = next_index;
		}
		
		// spiking networks
		if ( this.type==='snn' ) { 
			// 5) make new inputs for unmapped sensors that we could not reassign to an existing input node
			if ( unmapped_sensors.length ) {
				while ( unmapped_sensors.length ) {
					const next_index = Object.keys(this.input_map).length;
					const label  = unmapped_sensors.shift();
					this.network.inputs.push( Math.floor( Math.random() * this.network.nodes.length ) );
					this.input_map[label] = next_index;
				}
			}
			// 7.1) recreate the input map
			this.input_map = {};
			for ( let i=0; i < boid.sensor_labels.length; i++ ) {
				const label = boid.sensor_labels[i];
				if ( label in this.input_map ) { console.warn(`Non-unique sensor label ${label} will cause brain damage.`); }
				this.input_map[label] = i;
			}		
			// 8) remap the output nodes if physical abilities of boid have changed
			// 8.1) add new output nodes
			if ( boid.motors.length > this.network.outputs.length ) {
				while ( boid.motors.length > this.network.outputs.length ) {
					this.network.CreateRandomOutputNode();
				}
			}
			// 8.1) remove unused output nodes
			else if ( boid.motors.length < this.network.outputs.length ) {
				while ( boid.motors.length < this.network.outputs.length ) {
					this.network.outputs.pop();
				}
			}				
		}
		
		// neataptic 
		else {
			
			// 5) make new inputs for unmapped sensors that we could not reassign to an existing input node
			if ( unmapped_sensors.length ) {
				while ( unmapped_sensors.length ) {
					const next_index = Object.keys(this.input_map).length;
					const label  = unmapped_sensors.shift();
					const newnode = new neataptic.Node('input');
					this.network.nodes.splice(next_index, 0, newnode);
					// pick a random number of random connections
					const available = this.network.nodes.filter( n => n.type != 'input' ).shuffle();
					const num = utils.RandomInt(1,Math.min(5,available.length));
					for ( let i=0; i<num; i++ ) {
						const nextnode = available.pop();
						newnode.connect(nextnode); 
						if ( !available.length ) { break; }
					}
					this.input_map[label] = next_index;
				}
			}
			// 6) remove network input nodes that could not be filled
			const killme = [];
			if ( unused_indexes.length ) {
				unused_indexes.sort();
				while ( unused_indexes.length ) {
					const index = unused_indexes.pop();
					const node = this.network.nodes[index];
					killme.push(node);
				}
			}
			// 7) physically reorder the input nodes to align with the expected sensor outputs
			const new_order = [];
			for ( let i=0; i < boid.sensor_labels.length; i++ ) {
				const node = this.network.nodes[ this.input_map[ boid.sensor_labels[i] ] ];
				if ( node.type !== 'input' ) {
					console.warn('node ' + i + ' was not an input', node);
				}
				new_order.push( node );
			}
			for ( let node of killme ) { this.network.remove(node); } // final removal
			this.network.nodes.splice( 0, new_order.length, ...new_order );
			// 7.1) recreate the input map
			this.input_map = {};
			for ( let i=0; i < boid.sensor_labels.length; i++ ) {
				const label = boid.sensor_labels[i];
				if ( label in this.input_map ) { console.warn(`Non-unique sensor label ${label} will cause brain damage.`); }
				this.input_map[label] = i;
			}		
			// 8) remap the output nodes if physical abilities of boid have changed
			let output_nodes = this.network.nodes.filter( n => n.type === 'output' );
			let num_output_nodes = output_nodes.length;
			// 8.1) add new output nodes
			if ( boid.motors.length > num_output_nodes ) {
				while ( boid.motors.length > num_output_nodes ) {
					const available = this.network.nodes.filter( n => n.type !== 'output' ).shuffle();
					const newnode = new neataptic.Node('output');
					this.network.nodes.push(newnode);
					// pick a random number of random connections
					const num = utils.RandomInt(1,Math.min(5,available.length));
					for ( let i=0; i<num; i++ ) {
						const nextnode = available.pop();
						newnode.connect(nextnode); 
						if ( !available.length ) { break; }
					}
					num_output_nodes++;
				}
			}
			// 8.1) remove unused output nodes
			else if ( boid.motors.length < num_output_nodes ) {
				const diff = num_output_nodes - boid.motors.length;
				for ( let i=0; i<diff; i++ ) { 
					let node = output_nodes.pop(); 
					this.network.remove(node);
				}
			}					
			
			// internal bookkeeping - might be an oversight with neataptic library
			const x_num_input_nodes = this.network.nodes.filter( n => n.type === 'input' ).length;
			const x_num_output_nodes = this.network.nodes.filter( n => n.type === 'output' ).length;
			this.network.input = x_num_input_nodes;
			this.network.output = x_num_output_nodes;
		}
		
		return this;
	}
	
}
