
const MAX_BIAS = 0.25;
const MAX_WEIGHT = 0.65;

// in order of preference first
const ActivationFunctions = {
	/* v.fast */ relu: x => x > 0 ? x : 0,
	/* v.fast */ leaky_relu: x => x > 0 ? x : 0.01 * x,
	/* v.fast */ hard_sigmoid: x => ( x < -2.5 ? 0 : ( x > 2.5 ? 1 : (0.2 * x + 0.5) ) ),
	/* v.fast */ hard_tanh: x => ( x < -1 ? -1 : ( x > 1 ? 1 : x ) ),
	/*   fast */ smart_relu: x => x > 6 ? 6 : (x < 0 ? x * 0.01 : x),
	/*   fast */ softsign: x => x / (1 + Math.abs(x)),
	/*   fast */ sqnl: x => { // square non-linear
		if (x > 2) return 1;
		if (x < -2) return -1;
		if (x >= 0) return x - x * x / 4;
		return x + x * x / 4;
	},
	/* medium */ sigmoid: x => 1 / (1 + Math.exp(-x)),
	/* medium */ gaussian: x => Math.exp(-x * x),
	/*   slow */ tanh: x => Math.tanh(x),
	/*   slow */ arctan: x => Math.atan(x),
	/*   slow */ bent_id: x => (Math.sqrt(x * x + 1) - 1) / 2 + x,
	/*   slow */ swish: x => x * (1 / (1 + Math.exp(-x))),
	/* v.fast */ clamp: x => Math.max(-1, Math.min(1, x)),
	/* v.fast */ trinary: x => x >= 0.5 ? 1 : (x < -0.5 ? -1 : 0), // -1, 0, 1
	/* v.fast */ step: x => x >= 0 ? 1 : 0,
	/* v.fast */ polar: x => x >= 0 ? 1 : -1,
	/*   slow */ selu: x => x > 0 ? 1.0507009873554805 * x : 1.0507009873554805 * (1.6732632423543772 * (Math.exp(x) - 1)),
	/* v.slow */ gelu: x => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))),
	/* v.slow */ softplus: x => Math.log1p(Math.exp(x)),
	/* v.slow */ mish: x => x * Math.tanh(Math.log1p(Math.exp(x))),
	/* v.fast */ identity: x => x,
};

function RandomNumber(a = 0, b = 1) {return Math.random() * (b - a) + a;}

// choose a random activation function
function RandomActivationFunction(just_the_key = false) {
	const keys = Object.keys(ActivationFunctions);
	// const roll = 1 - ( Math.cbrt( Math.random() * 1000 ) / 10 ); // bias towards faster functions
	const roll = Math.random(); // no bias
	const index = Math.floor(roll * keys.length)
	const key = keys[ index ];
	return just_the_key ? key : ActivationFunctions[ key ];
}

// get an activation function key based on the function itself
function GetActivationFunctionKey(func) {
	for (let key in ActivationFunctions) {
		if (ActivationFunctions[ key ] === func) return key;
	}
	return null;
}

export default class EPANN {

	/*
		OPTIONS:
		activation_type: (ActivationFunction name) - use if you want all nodes to use the same function.
		connectivity: (float 0..1) how well connected network should try to aim for.
		output_jitter: (float 0..1) used for off-policy training scenarios.
		max_logs: (int) number of actions to store in the replay buffer.
		respect_layers: (bool) use distinct layers or just like, you know, whatever.
	*/
	constructor(config = {}) {
		this.nodes = []; // list of data structures, index order is important
		this.activation_type = config?.activation_type || null;
		this.num_inputs = config?.num_inputs ?? 0;
		this.num_outputs = config?.num_outputs ?? 0;
		this.connectivity = config?.connectivity ?? 0.5;
		this.output_jitter = config?.output_jitter ?? 0 ; //RandomNumber(0.02,0.1);
		this.max_logs = config?.max_logs || 0;
		this.respect_layers = !!config?.respect_layers;
		// activation log, used for hebbian reinforcement learning
		if (this.max_logs) {this.log = [];}
	}

	// Create randomized network
	Lobotomize(num_inputs, num_middles, num_outputs, connectivity = 1.0) {
		this.num_inputs = num_inputs || 1;
		this.num_outputs = num_outputs || 1;
		this.connectivity = connectivity || 0.9;
		this.nodes = [];
		if (this.max_logs) {this.log = [];}

		const total = this.num_inputs + num_middles + this.num_outputs;

		// create nodes
		for (let i = 0; i < total; i++) {
			// note: input and output nodes have no plasticity or bias
			const is_middle = i >= this.num_inputs && i < total - this.num_outputs;
			const plasticity = 1; //RandomNumber(0, 1);
			const bias = 0; //is_middle ? RandomNumber(0, MAX_BIAS) : 0;
			const squash = is_middle 
				? (this.activation_type ?? RandomActivationFunction(true) ) 
				: (i < total - this.num_outputs ? 'identity' : 'sigmoid');
			this.addNode({plasticity, bias, squash});
			// outputs always use sigmoid, inputs get nothing
		}

		// random connections with forward-only rule
		const first_output = this.nodes.length - this.num_outputs;
		for ( let src = 0; src < first_output; src++ ) {
			this.autoConnectNode(src);
		}
		
		// give any orphans at least one connection from a random previous node
		const orphans = this.ScanForOrphans();
		if ( orphans && orphans.length ) {
			for ( let to of orphans ) {
				let least = 0;
				let most = Math.min( to, first_output );
				if ( this.respect_layers ) {
					least = (to < first_output) ? 0 : this.num_inputs;
					most = (to < first_output) ? most : this.num_inputs;
				}
				const index_from = Math.floor(RandomNumber(least,most));
				this.addConnection(index_from, to);
			}
		}
		// normalize the weights
		this.NormalizeWeights();
	}

	addNode(opts = {}, insert_index = -1) {
		// speed note: including strings with the function data is ~5% slower than just having numbers
		// we like the variety of having functions per-node, but its faster to do them all the same 
		if ( opts === null ) { opts = {}; }
		let squash_type = (typeof opts.squash === 'string') ? opts.squash : this.activation_type;
		if ( !(squash_type in ActivationFunctions) ) {
			squash_type = 'tanh';
		}
		let squash = ActivationFunctions[ squash_type ];
		const node = {
			value: 0,
			bias: (typeof opts.bias === 'number') ? opts.bias : 0,
			plasticity: (typeof opts.plasticity === 'number') ? opts.plasticity : 1.0,
			squash_type: squash_type,
			squash: squash,
			conns: [],
			// TODO: unique ID for NEAT?
		};
		// insert or append
		if ( insert_index >= 0 && insert_index <= this.nodes.length ) {
			this.nodes.splice(insert_index, 0, node);
			// update counts
			if ( insert_index < this.num_inputs ) {
				this.num_inputs++;
			}
			else if ( insert_index >= this.nodes.length - this.num_outputs ) {
				this.num_outputs++;
			}
			// update all connections with affected indexes
			for ( let i = 0; i < this.nodes.length; i++ ) {
				const conns = this.nodes[ i ].conns;
				for ( let j = 0; j < conns.length; j += 2 ) {
					const dest = conns[ j ];
					if ( dest >= insert_index ) {
						conns[ j ]++;
					}
				}
			}
		}
		// otherwise append and do not modify counts - assume they are precomputed
		else { this.nodes.push(node); }

		// geometry changed
		if (this.max_logs) {this.log = [];}
	}

	removeNode(index, donate_connections = true) {
		if (index < 0 || index >= this.nodes.length) return false;
		// identify if this was an input, middle, or output node
		const was_input = index < this.num_inputs;
		const was_output = index >= this.nodes.length - this.num_outputs;
		const was_middle = !was_output && !was_input;
		// update counts
		if (was_input) {this.num_inputs--;}
		else if (was_output) {this.num_outputs--;}
		// hang on to the old connections
		const old_conns = this.nodes[ index ].conns;
		// remove the node
		this.nodes.splice(index, 1);
		// update all connections with affected indexes
		for (let i = 0; i < this.nodes.length; i++) {
			const conns = this.nodes[ i ].conns;
			for (let j = conns.length - 2; j >= 0; j -= 2) {
				const dest = conns[ j ];
				// decrement the index if it comes after the removed node
				if (dest > index) {
					conns[ j ]--;
				}
				// remove entire connection for matching indexes
				else if (dest == index) {
					// removing incoming connections can leave the from_node with no outgoing connections.
					// now is a good time to reassign them instead of leaving them hanging.
					if ( donate_connections ) {
						// choose a random node from the same layer
						if ( this.respect_layers ) {
							let least = 0;
							let most = this.nodes.length;
							if (was_input) {
								least = this.num_inputs;
								most = this.nodes.length - this.num_outputs;
							}
							else if (was_output) {
								least = 0;
								most = this.num_inputs;
							}
							// do avoid duplicate connections, we can't just reassign the node index.
							// we have to remove/add the entire connection.
							const new_dest = Math.floor(RandomNumber(least, most));
							const weight = conns[ j + 1 ];
							this.addConnection(i, new_dest, weight);
						}
						// pass existing connections from the origin node to the forward node, possibly skipping a layer:
						// O--->X--->O becomes O------>O
						else {
							// remove old connections as we go to avoid double-donations
							for (let c = old_conns.length-1; c >= 0; c -= 2) {
								const forward_dest = old_conns[ c ]-1; // account for stack shift
								const weight = old_conns[ c + 1 ];
								// only forward connections
								if ( forward_dest > index ) {
									const gotcha = this.addConnection(i, forward_dest, weight);
									if ( gotcha ) { old_conns.splice(c, 2); }
								}
							}
						}
					}
					conns.splice(j, 2);
				}
			}
		}
		// donate the old connections to random other nodes to avoid orphaning the target nodes
		if ( donate_connections && old_conns.length && index > 0 ) { 
			for (let c = 0; c < old_conns.length; c += 2) {
				const dest = old_conns[ c ]-1; // account for node we are removing
				const weight = old_conns[ c + 1 ];
				this.addConnection(index-1, dest, weight);
			}
		}
		// geometry changed
		if (this.max_logs) {this.log = [];}
	}

	addConnection(index_from, index_to, weight = 0) {
		// forward-only rule - swap indexes if needed
		if (index_to <= index_from) {
			const tmp = index_to; 
			index_to = index_from; 
			index_from = tmp;
			}
		if (index_from < 0 || index_from > this.nodes.length-2) return false;
		if (index_to < 1 || index_to > this.nodes.length-1) return false;
		if (!weight) { weight = RandomNumber(-MAX_WEIGHT, MAX_WEIGHT); }
		const conns = this.nodes[ index_from ].conns;
		// check if connection already exists
		for (let i = 0; i < conns.length; i += 2) {
			if (conns[ i ] === index_to) {
				conns[ i + 1 ] = weight; // update weight
				return true;
			}
		}
		// add new connection
		conns.push(index_to, weight);
		return true;
	}

	removeConnection(index_from, index_to, force = false) {
		if (index_from < 0 || index_from > this.nodes.length-2) return false;
		if (index_to < 1 || index_to >= this.nodes.length-1) return false;
		const conns = this.nodes[ index_from ].conns;
		// check if connection exists
		for (let i = 0; i < conns.length; i += 2) {
			if (conns[ i ] === index_to) {
				// check to see if removing this connection would leave the target node orphaned
				if ( !force ) {
					let orphaned = true;
					for (let j = 0; j < this.nodes.length; j++) {
						if (j === index_from) continue;
						const other_conns = this.nodes[ j ].conns;
						for (let k = 0; k < other_conns.length; k += 2) {
							if (other_conns[ k ] === index_to) {
								orphaned = false;
								break;
							}
						}
						if (!orphaned) break;
					}
					if ( orphaned ) { return false; }
				}
				conns.splice(i, 2); // remove connection
				return true;
			}
		}
		return false;
	}

	autoConnectNode( index ) {
		// random connections with forward-only rule
		const first_middle = this.num_inputs;
		const first_output = this.nodes.length - this.num_outputs;
		// any forward node
		let start = Math.max(first_middle, index + 1);
		let end = this.nodes.length;
		// by layer
		if ( this.respect_layers ) {
			// from input to middle
			if (index < first_middle) {
				start = first_middle;
				end = first_output;
			}
			// from middle to output
			else {
				start = first_output;
				end = this.nodes.length;
			}
		}
		// make the connections
		for ( let dest = start; dest < end; dest++ ) {
			let roll = Math.random();
			// discourage initial inter-middle connections to avoid narrow layering
			if (index >= this.num_inputs && dest < first_output) {
				roll = Math.pow(roll, 3);
			}
			if (roll >= (1 - this.connectivity)) {
				const weight = RandomNumber(-MAX_WEIGHT, MAX_WEIGHT);
				this.nodes[ index ].conns.push(dest, weight);
			}
		}
	}
	
	Activate(inputs = []) {

		// set inputs
		for (let i = 0; i < inputs.length; i++) {
			this.nodes[ i ].value = inputs[ i ];
		}
		// clear sums
		for (let i = inputs.length; i < this.nodes.length; i++) {
			const n = this.nodes[ i ];
			n.value = n.bias; // start with bias instead of adding it later
		}

		// push weights
		const first_output = this.nodes.length - this.num_outputs;
		for (let i = 0; i < first_output; i++) {
			const n = this.nodes[ i ];
			for (let c = 0; c < n.conns.length; c += 2) {
				const dest = n.conns[ c ];
				const weight = n.conns[ c + 1 ];
				this.nodes[ dest ].value += n.value * weight;
			}
			if ( i >= this.num_inputs ) {
				n.value = n.squash(n.value);
			}
		}

		// squash outputs using sigmoid for guaranteed 0..1 range.
		const outputs = [];
		for (let i = this.nodes.length - this.num_outputs; i < this.nodes.length; i++) {
			const n = this.nodes[ i ];
			// add random jitter to outputs to encourage exploration ("off-policy" learning)
			const jitter = (Math.random() - 0.5) * this.output_jitter;
			n.value += jitter;
			// final sigmoid squash
			const was = n.value;
			n.value = ActivationFunctions.sigmoid(was);
			outputs.push(n.value);
		}

		// push activation values to the history log
		if (this.max_logs > 0) {
			const values = this.nodes.map(n => n.value);
			this.log.unshift(values);
			if (this.log.length > this.max_logs) {
				this.log.pop();
			}
		}

		return outputs;
	}

	ScanForOrphans() {
		const gotchas = new Set();
		const orphans = new Set();
		// foreach node
		for (let i = 0; i < this.nodes.length; i++) {
			// foreach connection
			const n = this.nodes[ i ];
			for (let c = 0; c < n.conns.length; c += 2) {
				const dest = n.conns[ c ];
				gotchas.add(dest);
			}
		}
		// foreach node again to find orphans
		for (let i = this.num_inputs; i < this.nodes.length; i++) {
			// if not found in gotchas, its an orphan
			if (!gotchas.has(i)) {
				orphans.add(i);
			}
		}
		// // also look for nodes with no outgoing connections (except outputs)
		// for ( let i = 0; i < this.nodes.length - this.num_outputs; i++ ) {
		// 	if ( this.nodes[ i ].conns.length === 0 ) {
		// 		orphans.add(i);
		// 	}
		// }
		return orphans.size ? Array.from(orphans) : null;
	}
	
	// event_weight can be -1..1 to reward or punish.
	// learning rate controls overall speed. Increase in situations with few events.
	Learn(event_weight = 1.0, learning_rate = 0.02) {

		if (!this.max_logs || !this.log.length) {return;}

		// foreach node - iterate backwards (oldest to newest)
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[ i ];
			const plasticity = n.plasticity * learning_rate * event_weight;
			// foreach connection
			for (let c = 0; c < n.conns.length; c += 2) {
				const dest = n.conns[ c ];
				// foreach log entry
				for (let log of this.log) {
					const pre_val = log[ i ];
					const post_val = log[ dest ];
					const current_weight = n.conns[ c + 1 ];
					// TODO: you can further alter plasticity with modulating neurons or external hormones
					// OJA'S RULE
					// prevents infinite growth
					// y=w⋅x (post synaptic values, we already have these in log)
					// Δw = η(xy − y²w)
					const delta = plasticity * (pre_val * post_val - post_val * post_val * current_weight );
					// learn
					let new_val = n.conns[ c + 1 ] + delta;
					new_val = Math.max(-5, Math.min(5, new_val)); // clamp
					n.conns[ c + 1 ] = new_val;
				}
			}
		};

		this.NormalizeWeights();
		
		this.log = [];
	}

	// NOTE: normalizing weights does not seem to help learning process, but kept here for further exploration
	NormalizeWeights() {
		// // sum all INCOMING connections per node. nodes don't track this individually,
		// // so we need to build up a list here
		// let incoming = new Array(this.nodes.length);
		// for (let i = 0; i < this.nodes.length; i++) {
		// 	incoming[i] = [];
		// }
		// // build up the lists
		// for (let i = 0; i < this.nodes.length; i++) {
		// 	const n = this.nodes[ i ];
		// 	for (let c = 0; c < n.conns.length; c += 2) {
		// 		incoming[ n.conns[c] ].push({
		// 			from_node: i,
		// 			weight: n.conns[c+1],
		// 			conn_index: c
		// 		});
		// 	}
		// }
		// // sum and redistribute link juice
		// for (let i = 0; i < incoming.length; i++) {
		// 	let total = 0;
		// 	let max = 0;
		// 	for ( let row of incoming[i] ) {
		// 		total += Math.abs(row.weight); // note sign
		// 		max = Math.max( max, Math.abs(row.weight) ); // note sign
		// 	}
		// 	// rescale weights
		// 	if ( total > 1 ) {
		// 		const scale = 1 / total;
		// 		for ( let row of incoming[i] ) {
		// 			const n = this.nodes[ row.from_node ];
		// 			n.conns[ row.conn_index + 1 ] *= scale;
		// 		}
		// 	}
		// }
	}
	
	Mutate(reps = 1) {
		// measure connectivity
		const num_middles = this.nodes.length - (this.num_inputs + this.num_outputs);
		let upper_bound = num_middles * this.num_inputs + num_middles * this.num_outputs;
		let lower_bound = this.nodes.length;
		let spread = upper_bound - lower_bound;
		let desired_connections = lower_bound + this.connectivity * spread;
		let current_connections = 0;
		for (let n of this.nodes) {
			current_connections += n.conns.length / 2;
		}
		let conn_ratio = current_connections / desired_connections;
		
		// measure middle node ratio
		let node_ratio = num_middles / ( this.num_inputs / 2 );
		
		// calculate the odds
		const chances = {
			// add_node: 3 / node_ratio, // rubber banding
			// remove_node: 3 * node_ratio, // rubber banding
			add_connection: 10 / conn_ratio, // rubber banding
			remove_connection: 10 * conn_ratio, // rubber banding
			change_bias: 8,
			change_plasticity: 8,
			change_activation: 3,
			change_weight: 100,
		};
		
		// normalize chances
		let total_chance = 0;
		for (let key in chances) { total_chance += chances[ key ]; }
		for (let key in chances) { chances[ key ] /= total_chance; }
		
		// foreach mutation
		for (let r = 0; r < reps; r++) {
			let roll = Math.random();
			let action = 'change_weight';
			for ( let key in chances ) {
				roll -= chances[ key ];
				if ( roll <= 0 ) { 
					action = key;
					break;
				}
			}
			// add a new middle node
			if ( action == 'add_node'  ) {
				const new_index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs + 1));
				const squash = this.activation_type ?? RandomActivationFunction(true);
				this.addNode({plasticity: 1, bias: 0, squash}, new_index);
				// connect it to at least one forward node
				let index_to = Math.floor(RandomNumber(new_index + 1, this.nodes.length));
				this.addConnection(new_index, index_to);
				// connect a previous node to the new node
				let index_from = Math.floor(RandomNumber(0, new_index));
				this.addConnection(index_from, new_index);
			}
			// remove a middle node
			else if ( action == 'remove_node' ) {
				const middles = this.nodes.length - (this.num_inputs + this.num_outputs);
				if (middles > 0) {
					const index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs));
					this.removeNode(index);
				}
			}
			// add a connection
			else if ( action == 'add_connection' ) {
				const index_from = Math.floor(Math.random() * (this.nodes.length - this.num_outputs));
				// determine target range
				let first_target = index_from + 1;
				let last_target = this.nodes.length;
				// strict layer to layer connections
				if ( this.respect_layers ) {
					// from input to middle
					if (index_from < this.num_inputs) {
						first_target = this.num_inputs;
						last_target = this.nodes.length - this.num_outputs;
					}
					// from middle to output
					else {
						first_target = this.nodes.length - this.num_outputs;
						last_target = this.nodes.length;
					}
				}
				// any forward connection
				else {
					// bias the target node towards the end to favor output connections
					first_target = Math.max(index_from + 1, this.num_inputs);
					last_target = this.nodes.length;
				}
				const distance = last_target - first_target;
				const roll = ( 1 - ( Math.sqrt( Math.random() * 100 ) / 10 ) ) * distance;
				const index_to = Math.floor( roll + first_target );
				this.addConnection(index_from, index_to);
			}
			// remove a connection
			else if ( action == 'remove_connection' ) {
				const index_from = Math.floor(Math.random() * this.nodes.length);
				const conns = this.nodes[ index_from ].conns;
				if (conns.length > 1) { // keep at least one node
					const c = Math.floor(Math.random() * (conns.length / 2)) * 2;
					this.removeConnection( index_from, conns[ c ] ); // protect from orphaning target
				}
			}
			// change a node bias
			else if ( action == 'change_bias' ) {
				// choose a random middle node
				const index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs));
				const n = this.nodes[ index ];
				let bias = n.bias;
				// chance for complete randomization
				if (Math.random() < 0.1) {
					bias = RandomNumber(0, MAX_BIAS);
				}
				// otherwise just a small nudge
				else {
					bias += RandomNumber(-0.05, 0.05);
				}
				bias = Math.max(0, Math.min(MAX_BIAS, bias)); // clamp
				n.bias = bias;
			}
			// change plasticity
			else if ( action == 'change_plasticity' ) {
				// choose any random node
				const index = Math.floor(RandomNumber(0, this.nodes.length));
				const n = this.nodes[ index ];
				let p = n.bias;
				// chance for complete randomization
				if (Math.random() < 0.1) {
					p = RandomNumber(0, MAX_BIAS);
				}
				// otherwise just a small nudge
				else {
					p += RandomNumber(-0.05, 0.05);
				}
				p = Math.max(0, Math.min(MAX_BIAS, p)); // clamp
				n.plasticity = p;
			}
			// change middle node activation function
			else if ( action == 'change_activation' ) {
				// choose any random node
				const index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs));
				const n = this.nodes[ index ];
				const new_func = this.activation_type ?? RandomActivationFunction(true);
				n.squash_type = new_func;
				n.squash = ActivationFunctions[ new_func ];
			}
			// change a connection weight
			else {
				const index_from = Math.floor(Math.random() * this.nodes.length);
				const n = this.nodes[ index_from ];
				if (n.conns.length > 0) {
					const c = Math.floor(Math.random() * (n.conns.length / 2)) * 2;
					let weight = n.conns[ c + 1 ];
					// chance for complete randomization
					if (Math.random() < 0.1) {
						weight = RandomNumber(-MAX_WEIGHT, MAX_WEIGHT);
					}
					// otherwise just a small nudge
					else {
						weight += RandomNumber(-0.1, 0.1);
					}
					// TODO: respect plasticity?
					weight = Math.max(-1, Math.min(1, weight)); // clamp
					n.conns[ c + 1 ] = weight;
				}
			}
		}
		this.NormalizeWeights();
	}

	Export(asJSON=true) {
		const obj = {
			num_inputs: this.num_inputs,
			num_outputs: this.num_outputs,
			max_logs: this.max_logs,
			activation_type: this.activation_type,
			respect_layers: this.respect_layers,
			nodes: this.nodes.map(n => ({
				b: n.bias,
				p: n.plasticity,
				s: n.squash_type,
				c: n.conns.map((v, i) => (i % 2) ? parseFloat(v.toFixed(6)) : v) // truncate precision for smaller json
			})),
		};
		return asJSON ? JSON.stringify(obj) : obj;
	}

	Import(json) {
		const data = typeof (json) === 'string' ? JSON.parse(json) : json;
		this.num_inputs = data.num_inputs;
		this.num_outputs = data.num_outputs;
		this.max_logs = data.max_logs || 0;
		this.respect_layers = !!data.respect_layers;
		this.activation_type = data?.activation_type;
		this.nodes = data.nodes.map(n => ({
			value: 0,
			bias: n.b,
			plasticity: n.p,
			squash_type: n.s,
			squash: ActivationFunctions[ n.s ] || ActivationFunctions.tanh,
			conns: n.c
		}));
		if (this.max_logs) {this.log = [];}
	}

}