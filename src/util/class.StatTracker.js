import * as utils from './utils.js';

// Tracks a single-value statistic over multiple orders of magnitude.
// PARAMS
//	numLayers: number of orders of magnitude to keep track of. Use "1" if you just want a flat array.
//	recordsPerLayer: number of records to keep in each layer. Useful for graph displays.
//	base: the number of records averaged to create the next higher order record.
//	onInsert: callback function that reports new data being inserted. Useful for interactive graph updates or alarms.
//		Callback takes the form of function( data, layerIndex )
export class StatTracker {
	constructor(params) {
		this.base = utils.Clamp( params.base || 10, 2, 100 );
		this.recordsPerLayer = utils.Clamp( params.recordsPerLayer || 100, this.base, 10000);
		this.numLayers = utils.Clamp( params.numLayers || 3, 1, 10 );
		this.layers = new Array(this.numLayers).fill().map(() => []);
		this.recordNumber = 0; // helps us decide when to add to the next layer
		this.onInsert = params.onInsert || null;
		this.inserts = new Array(this.numLayers).fill(null);
	}
	Insert( data ) {
		this.inserts.fill(null);
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
			this.inserts[layer] = data;
			if ( this.onInsert ) {
				this.onInsert( data, layer );
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

// Tracks a multiple numeric statistic over multiple orders of magnitude.
// PARAMS
//	stats: array of names for the stats to track, e.g. ['stat1', 'stat2']
//	numLayers: number of orders of magnitude to keep track of. Use "1" if you just want a flat array.
//	recordsPerLayer: number of records to keep in each layer. Useful for graph displays.
//	base: the number of records averaged to create the next higher order record.
//	onInsert: callback function that reports new data being inserted. Useful for interactive graph updates or alarms.
//		Callback takes the form of function( data, layerIndex )
export class CompoundStatTracker {
	constructor( params ) {
		this.trackers = {}; // named stats each have their own tracker
		this.onInsert = params.onInsert || null;
		if ( this.onInsert ) {
			params.onInsert = null; // do not pass to child trackers
		}
		for ( let name of params.stats ) {
			this.trackers[name] = new StatTracker( params );
		}
		
	}
	Insert( data ) {
		for ( let name in data ) {
			if ( this.trackers[name] ) {
				this.trackers[name].Insert( data[name] );
			}
		}
		if ( this.onInsert ) {
			// we dont want all child stats to fire a bunch of events for onInsert.
			// in order to get meaningful results from onInsert, do our own calculation.
			let tracker = this.trackers[ Object.keys(this.trackers).pop() ]; // get a sample
			for ( let i=0; i < tracker.inserts.length; i++ ) {
				if ( tracker.inserts[i] !== null ) {
					let result = {};
					for ( let name in this.trackers ) {
						result[name] = this.trackers[name].inserts[i];
					}
					this.onInsert( result, i );
				}
			}
		}
	}
	LastOfEachLayer() {
		let result = {};
		for ( let name in this.trackers ) {
			result[name] = this.trackers[name].LastOfEachLayer();
		}
		return result;
	}
}