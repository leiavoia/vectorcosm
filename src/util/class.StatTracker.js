// import utils
import * as utils from './utils.js';
export default class StatTracker {
	constructor(params) {
		this.base = utils.Clamp( params.base || 10, 2, 100 );
		this.recordsPerLayer = utils.Clamp( params.recordsPerLayer || 100, this.base, 10000);
		const numLayers = utils.Clamp( params.numLayers || 3, 1, 10 );
		this.layers = new Array(numLayers).fill().map(() => []);
		this.recordNumber = 0;
	}
	Insert( data ) {
		this.recordNumber++;
		this.InsertToLayer( data, 0 );
	}
	InsertToLayer( data, layer ) {
		// insert data into the current layer
		if ( layer < this.layers.length ) {
			this.layers[layer].push(data);
			if ( this.layers[layer].length > this.recordsPerLayer ) {
				this.layers[layer].shift();
			}
		}
		// if the record number is divisible by a base, insert a new record into the next layer
		if ( layer + 1 < this.layers.length && this.recordNumber % Math.pow( this.base, layer+1 ) === 0 ) {
			// average the previous <base> number of records to create the new record
			let total = 0;
			let length = this.layers[layer].length;
			for ( let i = length-1; i >= (length - this.base); i-- ) {
				let v = this.layers[layer][i];
				total += v;
			}
			let new_data = total / this.base;
			this.InsertToLayer( new_data, layer + 1 );
		} 
	}
	LastOfEachLayer() {
		return this.layers.map(layer => layer.length ? layer[layer.length - 1] : 0);	
	}
}