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
			const tick_interval = 1/60;
			// start the clock
			if ( !this.last_update || this.last_update > timestamp ) { // indicates first tick
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
	
	toJSON() {
		let network = this.network.Export(false); // as object
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
		
		else if ( this.type==='epann' ) { 
		
			// 5) make new inputs for unmapped sensors that we could not reassign to an existing input node
			if ( unmapped_sensors.length ) {
				while ( unmapped_sensors.length ) {
					const next_index = Object.keys(this.input_map).length;
					const label  = unmapped_sensors.shift();
					this.input_map[label] = next_index;
					this.network.addNode(null,next_index);
					this.network.autoConnectNode(next_index);
				}
			}
			
			// 6) existing input nodes that could not be filled should be removed
			if ( unused_indexes.length ) {
				// delete in order from the back
				unused_indexes.sort(); 
				while ( unused_indexes.length ) {
					const index = unused_indexes.pop();
					this.network.removeNode(index);
				}
			}
			
			// 7) physically reorder the input nodes to align with the expected sensor outputs
			const new_order = []; // old_index => new_index
			for ( let i=0; i < boid.sensor_labels.length; i++ ) {
				const label = boid.sensor_labels[i];
				const index = this.input_map[label];
				const node = this.network.nodes[index];
				new_order.push( node );
			}
			this.network.nodes.splice( 0, new_order.length, ...new_order ); // dont need to change connections, just order
			
			// 7.1) recreate the input map
			this.input_map = {};
			for ( let i=0; i < boid.sensor_labels.length; i++ ) {
				const label = boid.sensor_labels[i];
				if ( label in this.input_map ) { 
					console.warn(`Non-unique sensor label ${label} will cause brain damage.`); 
				}
				this.input_map[label] = i;
			}		
			
			// 8) add new output nodes if physical abilities of boid have changed
			if ( boid.motors.length > this.network.num_outputs ) {
				while ( boid.motors.length > this.network.num_outputs ) {
					this.network.addNode();
					this.network.autoConnectNode(this.network.nodes.length-1);
				}
			}
			
			// 8.1) remove unused output nodes
			else if ( boid.motors.length < this.network.num_outputs ) {
				const diff = this.network.num_outputs - boid.motors.length;
				for ( let i=0; i<diff; i++ ) { 
					this.network.removeNode(this.network.nodes.length-1);
				}
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
