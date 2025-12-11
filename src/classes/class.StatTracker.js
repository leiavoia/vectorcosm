import * as utils from '../util/utils.js';

// Tracks a single-value statistic over multiple orders of magnitude.
// PARAMS
//	numLayers: number of orders of magnitude to keep track of. Use "1" if you just want a flat array.
//	recordsPerLayer: number of records to keep in each layer. Useful for graph displays.
//	base: the number of records averaged to create the next higher order record.
//	onInsert: callback function that reports new data being inserted. Useful for interactive graph updates or alarms.
//		Callback takes the form of function( data, layerIndex ). Example:
//			statTracker.onInsert = ( data, layer ) => {
//				if ( layer === 0 ) {
//					fpsChart1.data.labels.push(gameloop.frame);
//					fpsChart1.update();
//					if ( fpsChart1.data.labels.length > recordsPerLayer ) {
//						fpsChart1.data.labels.shift();
//					}
//				}
//			}
export class StatTracker {
	constructor(params) {
		this.base = utils.Clamp( params.base || 10, 2, 100 );
		this.recordsPerLayer = utils.Clamp( params.recordsPerLayer || 100, this.base, 10000);
		this.numLayers = utils.Clamp( params.numLayers || 3, 1, 10 );
		this.layers = new Array(this.numLayers).fill().map(() => []);
		this.recordNumber = 0; // helps us decide when to add to the next layer
		this.onInsert = params.onInsert || null;
		this.inserts = new Array(this.numLayers).fill(null); // keeps track of the last inserted data
		this.squash = 'avg'; // 'avg', 'sum', 'min', 'max'
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
			let v = this.SquashLayer(layer);
			this.InsertToLayer( v, layer + 1 );
		} 
	}
	SquashLayer( layer ) {
		let length = this.layers[layer].length;
		let x = 0;
		if ( this.squash == 'avg' ) {
			for ( let i = length-1; i >= (length - this.base); i-- ) {
				x += this.layers[layer][i];
			}
			x /= this.base;	
		}
		else if ( this.squash == 'sum' ) {
			for ( let i = length-1; i >= (length - this.base); i-- ) {
				x += this.layers[layer][i];
			}
		}
		else if ( this.squash == 'min' ) {
			for ( let i = length-1; i >= (length - this.base); i-- ) {
				x = Math.min( x, this.layers[layer][i] );
			}
		}
		else if ( this.squash == 'max' ) {
			for ( let i = length-1; i >= (length - this.base); i-- ) {
				x = Math.max( x, this.layers[layer][i] );
			}
		}
		return x;
	}
	LastOfEachLayer() {
		return this.layers.map(layer => layer.length ? layer[layer.length - 1] : 0);	
	}
	Export() {
		return {
			layers: this.layers.map(layer => [...layer]),
			base: this.base,
			recordsPerLayer: this.recordsPerLayer,
			numLayers: this.numLayers,
			recordNumber: this.recordNumber,
			squash: this.squash
		};
	}
	Import(data) {
		if (!data || !Array.isArray(data.layers)) return;
		this.base = data.base || this.base;
		this.recordsPerLayer = data.recordsPerLayer || this.recordsPerLayer;
		this.numLayers = data.numLayers || this.numLayers;
		this.recordNumber = data.recordNumber || 0;
		this.layers = data.layers.map(layer => Array.isArray(layer) ? [...layer] : []);
		this.inserts = new Array(this.numLayers).fill(null);
		this.squash = data.squash || 'avg';
	}
    static Import(data) {
        // if no data provided return a default tracker
        const params = {
            base: (data && data.base) ? data.base : undefined,
            recordsPerLayer: (data && data.recordsPerLayer) ? data.recordsPerLayer : undefined,
            numLayers: (data && data.numLayers) ? data.numLayers : undefined,
            squash: (data && data.squash) ? data.squash : 'avg',
        };
        const st = new StatTracker(params);
        if (!data) return st;
        st.recordNumber = data.recordNumber || 0;
        st.layers = (data.layers || []).map(layer => Array.isArray(layer) ? [...layer] : []);
        st.inserts = new Array(st.numLayers).fill(null);
        return st;
    }	
}

// Tracks a multiple numeric statistic over multiple orders of magnitude.
// PARAMS
//	stats: array of names for the stats to track, e.g. ['stat1', 'stat2']
//		can also take object of key value pairs to indicate layer squash modes (sum or average):
//		e.g. {'stat1' => 'sum', 'stat2' => 'average' }
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
		// if array
		if ( Array.isArray( params.stats ) ) {
			for ( let name of params.stats ) {
				this.trackers[name] = new StatTracker( params );
			}
		}
		// if object, use keys and look for layer squash modes
		else if ( typeof params.stats === 'object' ) {
			for ( let name in params.stats ) {
				this.trackers[name] = new StatTracker( params );
				let mode = params.stats[name];
				if ( mode === 'sum' ) {
					this.trackers[name].sum_layers = true;
				}
			}
		}
	}

	Insert( data ) {
		for ( let name in data ) {
			if ( this.trackers[name] ) {
				this.trackers[name].Insert( data[name] );
			}
			// if we don't already have this stat tracked, make a new tracker
			else {
				// use an existing tracker as a template for the new one
				let example = this.FirstTracker(); // get a sample
				this.trackers[name] = new StatTracker( example );
			}
		}
		if ( this.onInsert ) {
			// we dont want all child stats to fire a bunch of events for onInsert.
			// in order to get meaningful results from onInsert, do our own calculation.
			let tracker = this.FirstTracker(); // get a sample
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

	// utility function to access settings on the first tracker
	FirstTracker() {
		const first_key = Object.keys(this.trackers).shift();
		return this.trackers[ first_key ];
	}	

	Export() {
		let data = {};
		for (let name in this.trackers) {
			data[name] = this.trackers[name].Export();
		}
		return {
			stats: Object.keys(this.trackers),
			data: data
		};
	}

	Import(imported) {
		if (!imported || !imported.data) return;
		for (let name of imported.stats || Object.keys(imported.data)) {
			if (!this.trackers[name]) {
				// Use first existing tracker as template, or default params
				let example = this.trackers[Object.keys(this.trackers)[0]];
				this.trackers[name] = new StatTracker(example ? example.Export() : {});
			}
			this.trackers[name].Import(imported.data[name]);
		}
	}

    static Import(imported) {
        if (!imported) return new CompoundStatTracker({ stats: [] });
        const stats = imported.stats && Array.isArray(imported.stats) ? imported.stats : Object.keys(imported.data || {});
        const cs = new CompoundStatTracker({ stats });
        cs.Import(imported);
        return cs;
    }	

}
