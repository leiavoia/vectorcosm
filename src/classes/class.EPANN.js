
const MAX_BIAS = 0.25;
const MAX_WEIGHT = 0.65;

// in order of preference first
const ActivationFunctions = {
	/* v.fast */ relu: x => x > 0 ? x : 0,
	/* v.fast */ leaky_relu: x => x > 0 ? x : 0.01 * x,
	/* v.fast */ hard_sigmoid: x => Math.max(0, Math.min(1, 0.2 * x + 0.5)),
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
	/* v.fast */ polar: x => x >= 0 ? 1 : -1, // AKA "hard tanh"
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
	constructor(config = {}) {
		this.nodes = []; // list of data structures, index order is important
		this.activation_type = config.activation || 'softsign';
		this.activation_func = ActivationFunctions[ this.activation_type ];
		this.num_inputs = config.num_inputs ?? 0;
		this.num_outputs = config.num_outputs ?? 0;
		this.max_logs = config.max_logs || 0;
		// activation log, used for hebbian reinforcement learning
		if (this.max_logs) {this.log = [];}
	}

	// Create randomized network
	Lobotomize(num_inputs, num_middles, num_outputs, connectivity = 1.0) {
		this.num_inputs = num_inputs || 1;
		this.num_outputs = num_outputs || 1;
		this.nodes = [];
		if (this.max_logs) {this.log = [];}

		const total = this.num_inputs + num_middles + this.num_outputs;

		// create nodes
		for (let i = 0; i < total; i++) {
			// note: input and output nodes have no plasticity or bias
			const is_middle = i >= this.num_inputs && i < total - this.num_outputs;
			const plasticity = RandomNumber(0, 1);
			const bias = is_middle ? RandomNumber(0, MAX_BIAS) : 0;
			const squash = is_middle ? RandomActivationFunction(true) : (i < total - this.num_outputs ? 'identity' : 'sigmoid');
			this.addNode({plasticity, bias, squash});
			// outputs always use sigmoid, inputs get nothing
		}

		// random connections with forward-only rule
		const first_middle = this.num_inputs;
		const first_output = this.nodes.length - this.num_outputs;
		for (let src = 0; src < first_output; src++) {
			for (let dest = Math.max(first_middle, src + 1); dest < total; dest++) {
				let roll = Math.random();
				// discourage initial inter-middle connections to avoid narrow layering
				if (src >= this.num_inputs && dest < first_output) {
					roll = Math.pow(roll, 3);
				}
				if (roll >= (1 - connectivity)) {
					const weight = RandomNumber(-MAX_WEIGHT, MAX_WEIGHT);
					this.nodes[ src ].conns.push(dest, weight);
				}
			}
		}
	}

	addNode(opts = {}, insert_index = -1) {
		// speed note: including strings with the function data is ~5% slower than just having numbers
		// we like the variety of having functions per-node, but its faster to do them all the same 
		let squash_type = (typeof opts.squash === 'string') ? opts.squash : this.activation_type;
		let squash = ActivationFunctions[ squash_type ];
		if (typeof squash !== 'function') {
			squash_type = this.activation_type;
			squash = ActivationFunctions.tanh;
		}
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
		if (insert_index >= 0 && insert_index < this.nodes.length) {
			this.nodes.splice(insert_index, 0, node);
			// update counts
			if (insert_index < this.num_inputs) {this.num_inputs++;}
			else if (insert_index >= this.nodes.length - this.num_outputs) {this.num_outputs++;}
			// update all connections with affected indexes
			for (let i = insert_index; i < this.nodes.length; i++) {
				const n = this.nodes[ i ];
				for (let j = 0; j < n.conns.length; j += 2) {
					const dest = this.nodes[ i ].conns[ j ];
					if (dest >= insert_index) {
						n.conns[ j ]++;
					}
				}
			}
		}
		// otherwise append and do not modify counts - assume they are precomputed
		else {this.nodes.push(node);}

		// geometry changed
		if (this.max_logs) {this.log = [];}
	}

	removeNode(index) {
		if (index < 0 || index >= this.nodes.length) return false;
		// identify if this was an input, middle, or output node
		const was_input = index < this.num_inputs;
		const was_output = index >= this.nodes.length - this.num_outputs;
		// update counts
		if (was_input) {this.num_inputs--;}
		else if (was_output) {this.num_outputs--;}
		// remove the node
		this.nodes.splice(index, 0);
		// update all connections with affected indexes
		for (let i = 0; i < this.nodes.length; i++) {
			const conns = this.nodes[ i ].conns;
			for (let j = conns.length - 2; j >= 0; j -= 2) {
				const dest = conns[ j ];
				// remove entire connection for matching indexes
				if (dest == index) {
					conns.splice(j, 2);
				}
				// otherwise decrement the index if it comes after the removed node
				else if (dest > index) {
					conns[ j ]--;
				}
			}
		}
		// geometry changed
		if (this.max_logs) {this.log = [];}
	}

	addConnection(index_from, index_to, weight = 0) {
		if (!weight) {weight = RandomNumber(-MAX_WEIGHT, MAX_WEIGHT);}
		if (index_from < 0 || index_from >= this.nodes.length) return false;
		if (index_to < 0 || index_to >= this.nodes.length) return false;
		// forward-only rule - swap indexes if needed
		if (index_to <= index_from) {const tmp = index_to; index_to = index_from; index_from = tmp;}
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

	removeConnection(index_from, index_to) {
		if (index_from < 0 || index_from >= this.nodes.length) return false;
		if (index_to < 0 || index_to >= this.nodes.length) return false;
		const conns = this.nodes[ index_from ].conns;
		// check if connection exists
		for (let i = 0; i < conns.length; i += 2) {
			if (conns[ i ] === index_to) {
				conns.splice(i, 2); // remove connection
				return true;
			}
		}
		return false;
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
			// squash values while we're looping - there will be no further additions
			if (i >= this.num_inputs) {
				// it would be faster to just use a standard activation for the entire network
				// n.value = this.activation_func(n.value);
				// but its more fun to have them per node
				n.value = n.squash(n.value);
			}
		}

		// squash outputs using sigmoid for guaranteed 0..1 range.
		for (let i = this.nodes.length - this.num_outputs; i < this.nodes.length; i++) {
			const n = this.nodes[ i ];
			n.value = ActivationFunctions.sigmoid(n.value);
		}

		// create an output array
		const values = this.nodes.map(n => n.value);
		const outputs = values.slice(this.nodes.length - (this.num_outputs + 1), this.nodes.length);

		// push activation values to the history log
		if (this.max_logs > 0) {
			this.log.unshift(values);
			if (this.log.length > this.max_logs) {
				this.log.pop();
			}
		}

		return outputs;
	}

	// event_weight can be -1..1 to reward or punish.
	// learning rate controls overall speed. Increase in situations with few events.
	Learn(event_weight = 1.0, learning_rate = 0.1) {

		if (!this.max_logs || !this.log.length) {return;}

		// foreach node - iterate backwards (oldest to newest)
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[ i ];
			// foreach connection
			for (let c = 0; c < n.conns.length; c += 2) {
				const dest = n.conns[ c ];
				const plasticity = n.plasticity * learning_rate * event_weight;
				const current_weight = n.conns[ c + 1 ];
				// foreach log entry
				for (let log of this.log) {
					const pre_val = log[ i ];
					const post_val = log[ dest ];
					// TODO: you can further alter plasticity with modulating neurons or external hormones

					// OJA'S RULE
					// prevents infinite growth
					// y=w⋅x (post synaptic values, we already have these in log)
					// Δw = η(xy − y²w)
					const delta = plasticity * (pre_val * post_val - post_val * post_val * current_weight);

					// learn
					let new_val = n.conns[ c + 1 ] + delta;
					new_val = Math.max(-1, Math.min(1, new_val)); // clamp
					n.conns[ c + 1 ] = new_val;
				}
			}
		};

		this.log = [];
	}

	Mutate(reps = 1) {
		for (let r = 0; r < reps; r++) {
			const roll = Math.random();
			// add a new middle node
			if (roll < 0.05) {
				const new_index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs + 1));
				this.addNode({plasticity: RandomNumber(0, 1), bias: RandomNumber(0, MAX_BIAS), squash: RandomActivationFunction(true)}, new_index);
				// connect it to at least one forward node
				let index_to = Math.floor(RandomNumber(new_index + 1, this.nodes.length));
				this.addConnection(new_index, index_to);
				// connect a previous node to the new node
				let index_from = Math.floor(RandomNumber(0, new_index));
				this.addConnection(index_from, new_index);
			}
			// remove a middle node
			else if (roll < 0.095) {
				const middles = this.nodes.length - (this.num_inputs + this.num_outputs);
				if (middles > 0) {
					const index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs));
					this.removeNode(index);
				}
			}
			// add a connection
			else if (roll < 0.2) {
				const index_from = Math.floor(Math.random() * (this.nodes.length - 1));
				const index_to = Math.floor(RandomNumber(index_from + 1, this.nodes.length));
				this.addConnection(index_from, index_to);
			}
			// remove a connection
			else if (roll < 0.3) {
				const index_from = Math.floor(Math.random() * this.nodes.length);
				const n = this.nodes[ index_from ];
				if (n.conns.length > 0) {
					const c = Math.floor(Math.random() * (n.conns.length / 2)) * 2;
					n.conns.splice(c, 2);
				}
			}
			// change a node bias
			else if (roll < 0.34) {
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
			else if (roll < 0.4) {
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
			else if (roll < 0.44) {
				// choose any random node
				const index = Math.floor(RandomNumber(this.num_inputs, this.nodes.length - this.num_outputs));
				const n = this.nodes[ index ];
				const new_func = RandomActivationFunction(true);
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
					weight = Math.max(-1, Math.min(1, weight)); // clamp
					n.conns[ c + 1 ] = weight;
				}
			}
		}
	}

	Export(as_object = false) {
		const obj = {
			num_inputs: this.num_inputs,
			num_outputs: this.num_outputs,
			max_logs: this.max_logs,
			activation_type: this.activation_type,
			nodes: this.nodes.map(n => ({
				b: n.bias,
				p: n.plasticity,
				s: n.squash_type,
				c: n.conns.map((v, i) => (i % 2) ? parseFloat(v.toFixed(6)) : v) // truncate precision for smaller json
			})),
		};
		return as_object ? obj : JSON.stringify(obj);
	}

	Import(json) {
		const data = typeof (json) === 'string' ? JSON.parse(json) : json;
		this.num_inputs = data.num_inputs;
		this.num_outputs = data.num_outputs;
		this.max_logs = data.max_logs || 0;
		this.activation_type = data.activation || 'relu';
		this.activation_func = ActivationFunctions[ this.activation_type ];
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