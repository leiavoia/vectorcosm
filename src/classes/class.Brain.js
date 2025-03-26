import * as utils from '../util/utils.js';
import neataptic from "neataptic";
const { architect, Network } = neataptic;

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
		this.type = 'perceptron';
		this.network = null;
		this.input_map = {};
		this.output_adapters = [];
		this.outputs = [];
		// existing brain object
		if ( params?.brain ) {
			let json = params.brain.network.toJSON();
			this.network = neataptic.Network.fromJSON(json);
		}
		// literal json of entire brain including network
		else if ( params?.json ) {
			const pod = JSON.parse(params.json);
			Object.assign(this,pod);
			this.network = neataptic.Network.fromJSON(this.network); // poorly named function processes POD, not JSON
		}
		// create a new network from boid DNA
		else if ( params?.boid ) {
			this.network = this.MakeBrain( params.boid );
		}
	}
	
	// works the network, and outputs outputs to "outputs"
	Activate( inputs ) {
		this.outputs = this.network.activate( inputs );
		for ( let k in this.outputs ) {
			if ( Number.isNaN(this.outputs[k]) ) { this.outputs[k] = 0; }
		}
		return this.outputs;
	}
	
	toJSON() {
		let network = this.network.toJSON(); // misnomor, its not actually JSON, its POD object
		return JSON.stringify({
			type: this.type,
			input_map: this.input_map,
			network: network,
			output_adapters: this.output_adapters
		});
	}
	
	static fromJSON(json) {
		let brain = new Brain({json:json});
		return brain;
	}
	
	MakeBrain( boid ) {
		let inputs = boid.sensor_labels.length;
					
		const outputs = boid.motors.length || 1;

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
		
	Mutate( iterations=1 ) {
		for ( let n=0; n < iterations; n++ ) { 
			this.network.mutate( Brain.mutationOptionPicker.Pick() );
		}
		// Neataptic can alter output node bias. We don't want this.
		// This resets output node bias to zero. letting it run amok
		// can lead to "locked in" brain outputs that never change. 
		// You might specifically want it back someday, but not today.
		this.network.nodes.filter(n=>n.type=='output').forEach(n => n.bias = 0 );		
	}
}
