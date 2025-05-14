
// tuning config
const max_node_connections = 8;
const max_output_connections = 10;
const longjump_chance = 0.15;

// various functions used by output adapters
const OutputStrategies = {
	rate: function( o, current_tick ) {
		o.output = Math.min( 1, o.train.length / o.max_age );
	},
	step: function( o, current_tick ) {
		let sum = 0;
		for ( let tick of o.train ) {
			sum += 1;
		}
		const threshold = Math.sqrt( o.max_age * o.nodes.length ) * o.mod;
		o.output = ( sum >= threshold ) ? 1 : 0;
	},
	pressure: function( o, current_tick ) {
		o.output -= (1/30) / o.mod; // decay
		if ( o.output < 0 ) { o.output = 0; }
		for ( let tick of o.train ) {
			o.output += o.mod;
		}
		o.train.length=0; // treat like a temporary queue
		o.output = Math.min( o.output, 1 );
	},
	triangle_linear: function( o, current_tick ) {
		let sum = 0;
		for ( let tick of o.train ) {
			const dist = current_tick - tick;
			sum += dist / o.max_age;
		}
		o.output = Math.tanh( ( ( sum / o.nodes.length ) / ( o.max_age * 0.04 ) ) * o.mod );
	},
};

export default class SpikingNeuralNetwork {
	constructor( num_nodes=0, num_inputs=0, num_outputs=0 ) {
		this.tick = -1;
		this.nodes = [];
		this.events_next = []; // alternates index, weight, index, weight, ...
		this.events_now = []; // alternates index, weight, index, weight, ...
		this.inputs = []; // indexes point to other nodes for help on per-frame inputs
		this.outputs = [];
		this.use_decay = true;
		for ( let i=0; i < num_inputs; i++ ) {
			this.inputs.push( Math.round( i * (num_nodes/num_inputs) ) );
		}
		let output_strats = Object.keys(OutputStrategies);
		for ( let i=0; i < num_outputs; i++ ) {
			let nodes = [];
			const num_conns = Math.ceil( Math.random() * max_output_connections );
			for ( let n=0; n<num_conns; n++ ) {
				nodes.push( Math.floor(Math.random()*num_nodes) );
			}
			let strat_name = output_strats[ Math.floor( Math.random() * output_strats.length ) ];
			this.outputs.push( {
				nodes,
				train: [], 
				output: 0, 
				strat_name: strat_name,
				strat: OutputStrategies[strat_name],
				max_age: 10 + Math.ceil( Math.random() * 50 ),
				mod: ( Math.random() + Math.random() )
			} );
		}
		// create nodes
		for ( let i=0; i<num_nodes; i++ ) {
			const node = this.CreateRandomNode();
			this.nodes.push(node);
		}
		// semi random connections
		for ( let i = 0; i < this.nodes.length; i++ ) {
			this.CreateRandomConnections( i );
		};
	}
	CreateRandomConnections( node_index, num_conns=0 ) {
		const total_nodes = this.nodes.length;
		const n = this.nodes[node_index];
		if ( !num_conns ) {
				num_conns = Math.min( total_nodes, Math.ceil(Math.random()*max_node_connections) );
		}
		for ( let c = 0; c < num_conns; c++ ) {
			let index = this.ChooseTargetNodeForConnection( node_index );
			n.conns.push(index);
			let strength = Math.random() * 1.25 - 0.5;  // magic
			if ( Math.abs(strength) < 0.1 ) { strength += strength + strength; }
			n.conns.push( strength );
		}
	}
	ChooseTargetNodeForConnection( node_index ) {
		const total_nodes = this.nodes.length;
		// const cell_size = 45; // experimental
		// const num_cells = Math.ceil(total_nodes/cell_size); // experimental
		// const locality = Math.ceil(cell_size/2);
		// const range = cell_size;
		const locality = Math.ceil( Math.sqrt(total_nodes) );
		const range = 1 + 2 * locality;
		let choice = Math.random() < longjump_chance
			// small chance for longshot
			? Math.floor(Math.random() * total_nodes)
			// otherwise choose from nodes nearby
			: ( Math.floor(Math.random() * range) - locality );
			// : ( Math.floor(Math.random() * range) );
		let index = ( total_nodes + choice + node_index ) % total_nodes; // javascript cant handle negative number modulus
		// let index = ( total_nodes + choice + Math.floor( i / cell_size ) * cell_size ) % total_nodes; // javascript cant handle negative number modulus
		if ( index === node_index ) { index = ( node_index + 1 ) % total_nodes; }
		return index;
	}
	CreateRandomNode() {
		const node = {
			v:0,
			threshold: ( Math.random() * 0.8 + 0.2 ) , // magic 
			// exponential decay (more cool)
			// decay: -0.1 + Math.random() * -0.16,
			// linear decay (faster)
			decay: ( 1 / ( 30 + ( Math.random() * 120 ) ) ), // voltage per tick
			refract: Math.round( 5 * Math.pow( Math.random(), 4 ) ),
			fired: -2,
			conns:[], // alternates index, weight, index, weight, ...
		}
		return node;
	}
	activate( inputs ) { return this.Tick(inputs); } // alias
	Tick( inputs ) {
		this.tick++;
		// signal decay
		// optimization: if iterating all nodes becomes too slow, we may gain
		// benefit from maintaining a Set of nodes to be decayed instead.
		if ( this.use_decay ) {
			for ( let n of this.nodes ) {
				// exponential decay (more cool)
				// n.v *= Math.exp(n.decay) || 1;
				// linear decay (faster)
				if ( n.v < -n.decay ) { n.v += n.decay; continue; }
				if ( n.v > n.decay ) { n.v -= n.decay; continue; }
				n.v = 0;
			}						
		}
		// swap the event buffers
		let temp = this.events_now;
		this.events_now = this.events_next;
		this.events_next = temp;
		// add inputs
		let max = Math.min( this.inputs.length, inputs.length );
		for ( let i=0; i < max; i++ ) {
			this.ReceiveSignal( this.inputs[i], inputs[i] );
		}
		// process all signal events
		for ( let i=0; i < this.events_now.length; i++ ) {
			let n = this.nodes[ this.events_now[i] ];
			for ( let c=0; c < n.conns.length; c+=2 ) {
				this.ReceiveSignal( n.conns[c], n.conns[c+1] );
			}
		}
		this.events_now.length=0; // purge queue in one shot instead of shifting each item
		// console.log(this.tick);
	}
	ReceiveSignal( index, v ) {
		let n = this.nodes[index];
		// refractory period
		if ( n.fired >= this.tick - n.refract ) { return; }
		// integrate
		n.v += v;
		// fire
		if ( n.v >= n.threshold ) { 
			n.v = 0;
			n.fired = this.tick;
			// queue signals for next tick
			this.events_next.push(index); 
		}
		// don't allow bottomless pits
		else if ( n.v < -1 ) {
			n.v = -1;
		}
	}
	CalculateOutputs() {
		for ( let o of this.outputs ) {
			// clear old events from the spike train
			const oldest = this.tick - o.max_age;
			while ( o.train.length && o.train[0] < oldest ) {
				o.train.shift();
			}
			// record new events from this frame
			for ( let i of o.nodes ) {
				const n = this.nodes[i];
				if ( n.fired === this.tick ) {
					o.train.push( this.tick );
				}
			}
			// calculate a result
			o.strat(o,this.tick);
		}
	}
	Mutate( reps=1 ) {
		// option : chance
		let options = {
			node_add: 10,
			node_remove: 10,
			node_index_swap: 5,
			node_refractory: 30,
			node_threshold: 100,
			node_decay: 80,
			conn_value: 200,
			conn_add: 50,
			conn_remove: 50,
			conn_reassign: 60,
			conn_reverse: 30,
			output_strat: 10,
			output_conn_add: 20,
			output_conn_remove: 20,
			output_train_length: 60,
			output_mod: 50,
		};
		let keys = Object.keys(options);
		const total = Object.values(options).reduce( (a,c) => a+c, 0 );
		for ( let rep=0; rep<reps; rep++ ) {
			let at = 0;
			const roll = Math.random() * total;
			for ( let k of keys ) {
				at += options[k];
				// perform action
				if ( roll <= at ) {
					switch ( k ) {
						case 'node_add': {
							// create the node
							const node = this.CreateRandomNode();
							// random insertion index
							const insertion_index = Math.floor( Math.random() * this.nodes.length );
							this.nodes.splice( insertion_index, 0, node );
							// since we moved the indexes, we need to scoot the whole stack
							for ( let i=0; i<this.nodes.length; i++ ) {
								const n = this.nodes[i];
								for ( let c=0; c<n.conns.length; c+=2 ) {
									if ( n.conns[c] >= insertion_index ) {
										n.conns[c]++;
									}
								}
							}
							for ( let output of this.outputs ) {
								for ( let n=0; n < output.nodes.length; n++ ) {
									if ( output.nodes[n] >= insertion_index ) {
										output.nodes[n]++;
									}
								}
							}
							for ( let i=0; i<this.inputs.length; i++ ) {
								if ( this.inputs[i] >= insertion_index ) {
									this.inputs[i]++;
								}
							}
							// wire in the new node connections
							this.CreateRandomConnections( insertion_index );
							break;
						}
						case 'node_remove': {
							// we can't remove less than number of inputs
							if ( this.nodes.length <= 2 ) { break; }
							// random index
							const insertion_index = Math.floor( Math.random() * this.nodes.length );
							this.nodes.splice( insertion_index, 1 );
							// since we moved the indexes, we need to scoot the whole stack
							for ( let n of this.nodes ) {
								for ( let c=n.conns.length-2; c >= 0; c-=2 ) {
									if ( n.conns[c] === insertion_index ) {
										// remove connections to old node
										const removed = n.conns.splice(c,2);
									}
									else if ( n.conns[c] > insertion_index ) {
										n.conns[c] = n.conns[c] - 1;
									}
									else {
									}
								}
							}
							for ( let output of this.outputs ) {
								for ( let n=output.nodes.length-1; n >= 0; n-- ) {
									if ( output.nodes[n] === insertion_index ) {
										// replace removed node with random pick
										output.nodes[n] = Math.floor( Math.random() * this.nodes.length );
									}
									else if ( output.nodes[n] > insertion_index ) {
										output.nodes[n] = output.nodes[n] - 1;
									}
								}
							}
							for ( let i=this.inputs.length-1; i >= 0 ; i-- ) {
								if ( this.inputs[i] === insertion_index ) {
									// replace removed node with next in index order
									this.inputs[i] = ( this.inputs[i] + 1 ) % this.nodes.length;
								}
								else if ( this.inputs[i] > insertion_index ) {
									this.inputs[i] = this.inputs[i] - 1;
								}
							}
							for ( let i=this.events_next.length-1; i >= 0 ; i-- ) {
								if ( this.events_next[i] >= this.nodes.length ) {
									this.events_next.splice(i,1);	
								}										
							}
							break;
						}
						case 'node_index_swap': {
							const index1 = Math.floor( Math.random() * this.nodes.length );
							let index2 = Math.floor( Math.random() * this.nodes.length );
							if ( index1 === index2 ) { index2 = (index1 + 1) % this.nodes.length; }
							const temp = this.nodes[index1];
							this.nodes[index1] = this.nodes[index2];
							this.nodes[index2] = temp;
							// remove self referencing nodes
							for ( let i of [index1, index2] ) {
								const n = this.nodes[i];
								for ( let c = n.conns.length-2; c >= 0; c-=2 ) {
									if ( c === i ) {
										n.conns.splice( c, 2 );
									}
								}
							}
							break;
						}
						case 'node_refractory': {
							const index = Math.floor( Math.random() * this.nodes.length );
							this.nodes[index].refract = Math.random() > 0.5 ? 1 : -1;
							this.nodes[index].refract = Math.min( Math.max( this.nodes[index].refract, 0 ), 8 ); // magic
							break;
						}
						case 'node_threshold': {
							const index = Math.floor( Math.random() * this.nodes.length );
							this.nodes[index].threshold += Math.random() * 1.25;
							this.nodes[index].threshold /= 2;
							break;
						}
						case 'node_decay': {
							const index = Math.floor( Math.random() * this.nodes.length );
							this.nodes[index].decay = ( 1 / ( 30 + ( Math.random() * 120 ) ) );
							break;
						}
						case 'conn_value': {
							const node_index = Math.floor( Math.random() * this.nodes.length );
							const n = this.nodes[node_index];
							if ( !n.conns.length ) { break; }
							const conn_index = 1 + 2 * Math.floor( Math.random() * n.conns.length * 0.5 );
							let strength = Math.random() * 1.25 - 0.5;  // magic
							if ( Math.abs(strength) < 0.1 ) { strength += strength + strength; }
							n.conns[conn_index] = strength;
							break;
						}
						case 'conn_add': {
							const index1 = Math.floor( Math.random() * this.nodes.length );
							this.CreateRandomConnections( index1, 1 );
							break;
						}
						case 'conn_remove': {
							const node_index = Math.floor( Math.random() * this.nodes.length );
							const n = this.nodes[node_index];
							if ( !n.conns.length ) { break; }
							const conn_index = 2 * Math.floor( Math.random() * n.conns.length * 0.5 );
							n.conns.splice( conn_index, 2 );
							break;
						}
						case 'conn_reassign': {
							const index1 = Math.floor( Math.random() * this.nodes.length );
							const n = this.nodes[index1];
							if ( !n.conns.length ) { break; }
							let index2 = this.ChooseTargetNodeForConnection( index1 );
							const conn_index = 2 * Math.floor( Math.random() * n.conns.length * 0.5 );
							n.conns[conn_index] = index2;
							break;
						}
						case 'conn_reverse': {
							const node_index = Math.floor( Math.random() * this.nodes.length );
							const n = this.nodes[node_index];
							if ( !n.conns.length ) { break; }
							const conn_index = 2 * Math.floor( Math.random() * n.conns.length * 0.5 );
							const removed = n.conns.splice( conn_index, 2 );
							this.nodes[removed[0]].conns.push( node_index ); // the swap
							this.nodes[removed[0]].conns.push( removed[1] );
							break;
						}
						case 'output_strat': {
							const output_index = Math.floor( Math.random() * this.outputs.length );
							let output_strats = Object.keys(OutputStrategies);
							let strat_name = output_strats[ Math.floor( Math.random() * output_strats.length ) ];
							this.outputs[output_index].strat = OutputStrategies[strat_name];
							break;
						}
						case 'output_conn_add': {
							const output_index = Math.floor( Math.random() * this.outputs.length );
							const node_index = Math.floor( Math.random() * this.nodes.length );
							this.outputs[output_index].nodes.push( node_index );
							break;
						}
						case 'output_conn_remove': {
							const index = Math.floor( Math.random() * this.outputs.length );
							if ( this.outputs[index].nodes.length <= 1 ) { break; }
							const place = Math.floor( Math.random() * this.outputs[index].nodes.length );
							this.outputs[index].nodes.splice( place, 1 );
							break;
						}
						case 'output_train_length': {
							const index = Math.floor( Math.random() * this.outputs.length );
							this.outputs[index].max_age = Math.ceil( Math.random() * 80 );
							break;
						}
						case 'output_mod': {
							const index = Math.floor( Math.random() * this.outputs.length );
							this.outputs[index].mod = 0.2 + Math.random() * 1.8;
							break;
						}
					}
				break; 
				}
			}
		}
	}
	Export( asJSON=true, inc_state=false ) {
		const obj = {
			nodes: this.nodes.map( n => { 
				let node = {
					t: +n.threshold.toFixed(3), // name change
					d: +n.decay.toFixed(4),
					r: n.refract,
					c: n.conns.slice().map( (v,i) => (i%2) ? +v.toFixed(3) : v )
				};
				if ( inc_state ) { 
					node.v = n.v; 
					node.f = n.fired;
				}
				return node;
			}),
			outputs: this.outputs.map( o => {
				let output = {
					n: o.nodes.slice(),
					s: o.strat_name,
					a: o.max_age,
					m: +o.mod.toFixed(3)
				};
				if ( inc_state ) { output.o = o.output; }
				return output;
			}),
			inputs: this.inputs.slice()
		};
		if ( inc_state ) { obj.tick = this.tick; }
		return asJSON ? JSON.stringify( obj ) : obj ;
	}
	Import( json ) { /* JSON string or raw object */
		const from = (typeof json === 'string') ? JSON.parse(json) : json;
		this.nodes = from.nodes.map( n => ({
			v:0,
			fired: -2,
			threshold: n.t,
			decay: n.d,
			refract: n.r,
			conns: n.c,
		}));
		this.outputs = from.outputs.map( o => ({
			nodes: o.n,
			strat_name: o.s,
			strat: OutputStrategies[o.s],
			max_age: o.a,
			mod: o.m,
			train: [],
		}));
		this.inputs = from.inputs;
		this.tick = -1;
		this.events_next.length = 0;
		this.events_now.length = 0;
	}
}
