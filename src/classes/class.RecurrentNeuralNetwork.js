const MAX_INITIAL_WEIGHT = 0.35;

export default class RecurrentNeuralNetwork {
	
	constructor(layerSizes) {
		this.decayTime = 1.0; // seconds

		// Initialize layers (nodes)
		this.nodes = layerSizes.map((size) => new Array(size).fill(0));

		// Initialize hidden states for each hidden layer (excluding input and output layers)
		this.hiddenStates = layerSizes.slice(1, -1).map((size) => new Array(size).fill(0));

		// Initialize biases (no biases for input or output layers)
		this.biases = layerSizes.slice(1, -1).map((size) =>
			new Array(size).fill(0).map(() => Math.random() * (MAX_INITIAL_WEIGHT * 2) - MAX_INITIAL_WEIGHT)
		);

		// Initialize connections (including self-connections for hidden layers)
		this.connections = this.createConnections(layerSizes, 1.0);
	}

	// Create connections between layers (including self-connections for hidden layers)
	createConnections(layerSizes, connectivity=1.0) {
		const connections = [];

		// Normal inter-layer connections
		for (let fromLayer = 0; fromLayer < layerSizes.length - 1; fromLayer++) {
			const fromSize = layerSizes[fromLayer];
			const toSize = layerSizes[fromLayer + 1];
			const layerConnections = new Array(fromSize).fill(null).map(() =>
				Array.from({ length: Math.floor(Math.random() * toSize) }, () => [
					Math.floor(Math.random() * toSize), // Target node index
					Math.random() * (MAX_INITIAL_WEIGHT * 2) - MAX_INITIAL_WEIGHT, // Weight
				]).flat() // Flatten to a single array
			);
			connections.push(layerConnections);
		}

		// Self-connections for hidden layers
		for (let hiddenLayer = 1; hiddenLayer < layerSizes.length - 1; hiddenLayer++) {
			const size = layerSizes[hiddenLayer];
			const selfConnections = new Array(size).fill(null).map(() =>
				Array.from({ length: Math.floor(Math.random() * size) }, () => [
					Math.floor(Math.random() * size), // Target node index
					Math.random() * (MAX_INITIAL_WEIGHT * 2) - MAX_INITIAL_WEIGHT, // Weight
				]).flat() // Flatten to a single array
			);
			connections.push(selfConnections);
		}

		return connections;
	}

	// ReLU activation function
	relu(x) {
		return Math.max(0, x);
	}
	
	// Safe ReLU - leaky with max cap
	saferelu(x) {
		return x < 0 ? ( x * 0.01 ) : Math.min(x,10);
	}

	// Sigmoid activation function (for clamping outputs to 0..1)
	sigmoid(x) {
		return 1 / (1 + Math.exp(-x));
	}

	// Forward pass
	activate(inputs, timeDelta = 0.05) {
		if (inputs.length !== this.nodes[0].length) {
			throw new Error("Input size does not match the number of inputs.");
		}

		// Apply decay to hidden states before any other calculations
		this.hiddenStates.forEach((hiddenState, layerIndex) => {
			const decayTime = Math.pow(this.decayTime, layerIndex); // longer memory on deeper layers
			const decayFactor = Math.exp(-timeDelta / decayTime);
			for (let i = 0; i < hiddenState.length; i++) {
				hiddenState[i] *= decayFactor;
			}
		});

		// Set input layer
		this.nodes[0] = inputs;

		// Propagate through layers
		for (let layer = 1; layer < this.nodes.length; layer++) {
			const prevLayer = this.nodes[layer - 1];
			const currentLayer = this.nodes[layer];
			const biases = this.biases[layer - 1] || [];
			const connections = this.connections[layer - 1];

			// If this is a hidden layer, include self-connections and hidden states
			const isHiddenLayer = layer > 0 && layer < this.nodes.length - 1;
			const selfConnections = isHiddenLayer ? this.connections[this.nodes.length - 1 + (layer - 1)] : null;
			const hiddenState = isHiddenLayer ? this.hiddenStates[layer - 1] : null;

			for (let toNode = 0; toNode < currentLayer.length; toNode++) {
				let sum = 0;

				// Contributions from the previous layer
				connections.forEach((fromNodeConnections, fromNode) => {
					for (let i = 0; i < fromNodeConnections.length; i += 2) {
						const to = fromNodeConnections[i];
						const weight = fromNodeConnections[i + 1];
						if (to === toNode) {
							sum += prevLayer[fromNode] * weight;
						}
					}
				});

				// Contributions from self-connections (hidden state)
				if (isHiddenLayer) {
					selfConnections.forEach((fromNodeConnections, fromNode) => {
						for (let i = 0; i < fromNodeConnections.length; i += 2) {
							const to = fromNodeConnections[i];
							const weight = fromNodeConnections[i + 1];
							if (to === toNode) {
								sum += hiddenState[fromNode] * weight;
							}
						}
					});
				}

				// Add bias
				if (biases.length > 0) {
					sum += biases[toNode];
				}

				// Apply activation function
				currentLayer[toNode] = layer === this.nodes.length - 1 ? this.sigmoid(sum) : Math.tanh(sum);
				// currentLayer[toNode] = layer === this.nodes.length - 1 ? this.sigmoid(sum) : this.relu(sum);
				// currentLayer[toNode] = layer === this.nodes.length - 1 ? this.sigmoid(sum) : this.saferelu(sum);
			}

			// Update hidden state for hidden layers
			if (isHiddenLayer) {
				this.hiddenStates[layer - 1] = [...currentLayer];
			}
		}

		// Return output layer
		return this.nodes[this.nodes.length - 1];
	}

	// Export the network to a compact JSON format
	Export( asJSON=true ) {
		const truncate = (value) => parseFloat(value.toFixed(6));
		const obj = {
			s: this.nodes.map((layer) => layer.length), // Layer sizes
			b: this.biases.map((layer) => layer.map(truncate)), // Truncate biases
			c: this.connections.map((layer) =>
				layer.map((fromNodeConnections) =>
					fromNodeConnections.map((value) => truncate(value))
				)
			),
		};
		return asJSON ? JSON.stringify(obj) : obj;
	}

	// Import the network from a JSON string
	Import( json ) {  /* JSON string or raw object */
		const data = (typeof json === 'string') ? JSON.parse(json) : json;

		// Reinitialize nodes
		this.nodes = data.s.map((size) => new Array(size).fill(0));

		// Reinitialize biases
		this.biases = data.b;

		// Reinitialize connections
		this.connections = data.c;

		// Reinitialize hidden states
		this.hiddenStates = data.s.slice(1, -1).map((size) => new Array(size).fill(0));
	}
	
	Mutate( reps=1 ) {
		for ( let r = 0; r < reps; r++ ) {
			// pick a node
			const layerIndex = Math.floor( Math.random() * this.nodes.length );
			const nodeIndex = Math.floor( Math.random() * this.nodes[layerIndex].length );
			const role = Math.random();
			// adjust bias
			if ( role < 0.05 && layerIndex > 0 && layerIndex < this.nodes.length - 1 ) {
				const biasIndex = Math.floor( Math.random() * this.biases[layerIndex - 1].length );
				this.biases[layerIndex - 1][biasIndex] += this.WeightedRandomAdjustment(0.5);
			}
			// adjust a connection weight
			else {
				const connLayerIndex = layerIndex < this.nodes.length - 1 ? layerIndex : this.nodes.length - 2 + ( layerIndex - 1 );
				const fromNodeIndex = Math.floor( Math.random() * this.connections[connLayerIndex].length );
				const fromNodeConnections = this.connections[connLayerIndex][fromNodeIndex];
				if ( fromNodeConnections.length > 0 ) {
					const connIndex = Math.floor( Math.random() * ( fromNodeConnections.length / 2 ) ) * 2 + 1; // pick a weight index
					fromNodeConnections[connIndex] += this.WeightedRandomAdjustment();
				}
			}
		}
	}
	
	Reset() {
		for ( let i = 0; i < this.hiddenStates.length; i++ ) {
			this.hiddenStates[i].fill(0);
		}
		for ( let i = 0; i < this.nodes.length; i++ ) {
			this.nodes[i].fill(0);
		}	
	}	
	
	// produces numbers towards the low end of the range (sqrt)
	WeightedRandomAdjustment( maxAdjustment=1.0 ) {
		let v = Math.sqrt( Math.random() * 100 );
		v = 10 - v;
		return v * 0.1 * maxAdjustment;
	}
		
}
