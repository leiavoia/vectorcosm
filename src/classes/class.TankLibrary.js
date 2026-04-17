/* <AI>
TankLibrary — Persistence for saved tank scenes via a pluggable StorageAdapter.

OVERVIEW
- `Add(scene, label, meta)` — saves a new tank entry; returns new id.
- `Save(id, scene, label, meta)` — overwrites an existing entry by id.
- `AddRow(row)` — import from file (row has index fields + `scene`).
- `Get(params)` — returns index rows only (no scene data). Filter by id.
- `GetData(id)` — loads the full scene JSON for one tank.
- `Delete(id)` — removes both index and data.
- `Update(row)` — updates index fields only.

META FIELDS TRACKED
- width, height, num_boids, num_plants, num_rocks, num_foods, age.

ADAPTER
- Set `TankLibrary.default_adapter` once at startup. Same adapter instance as BoidLibrary is fine.
- Or pass per-instance: `new TankLibrary(myAdapter)`.

EVENTS
- Publishes 'tank-library-addition' with `{ id }` on Add/Save.
</AI> */

import * as utils from '../util/utils.js'
import PubSub from 'pubsub-js'

export default class TankLibrary {

	// set once at startup before first instance; fallback null causes errors
	static default_adapter = null;
	static collection = 'tanks';

	constructor( adapter = null ) {
		this.adapter = adapter ?? TankLibrary.default_adapter;
		this.collection = TankLibrary.collection;
	}

	async Add( scene, label=null, meta={} ) {
		let now = Date.now();
		if ( !label ) { label = now; }
		const index_row = {
			label: label,
			date: now,
			width: meta.width || 0,
			height: meta.height || 0,
			num_boids: meta.num_boids || 0,
			num_plants: meta.num_plants || 0,
			num_rocks: meta.num_rocks || 0,
			num_foods: meta.num_foods || 0,
			age: meta.age || 0,
		};
		const id = await this.adapter.indexPut(this.collection, index_row);
		await this.adapter.dataPut(this.collection, id, { id, scene });
		PubSub.publish('tank-library-addition', { id });
		return id;
	}

	async Save( id, scene, label=null, meta={} ) {
		// update existing record by id
		let now = Date.now();
		if ( !label ) { label = now; }
		const index_row = {
			id: id,
			label: label,
			date: now,
			width: meta.width || 0,
			height: meta.height || 0,
			num_boids: meta.num_boids || 0,
			num_plants: meta.num_plants || 0,
			num_rocks: meta.num_rocks || 0,
			num_foods: meta.num_foods || 0,
			age: meta.age || 0,
		};
		await this.adapter.indexPut(this.collection, index_row);
		await this.adapter.dataPut(this.collection, id, { id, scene });
		PubSub.publish('tank-library-addition', { id });
		return id;
	}
	
	async AddRow( row ) {
		// for importing from file - row has index fields + scene
		const scene = row.scene || {};
		delete row.scene;
		// don't let IDs in from the outside
		delete row.id;
		const id = await this.adapter.indexPut(this.collection, row);
		await this.adapter.dataPut(this.collection, id, { id, scene });
		PubSub.publish('tank-library-addition', { id });
		return id;
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		// only update index fields
		const { scene, ...index_row } = row;
		return await this.adapter.indexPut(this.collection, index_row);
	}
	
	async Delete( id ) {
		await this.adapter.dataDelete(this.collection, id);
		return await this.adapter.indexDelete(this.collection, id);
	}
	
	// Get index rows only (lightweight, no scene data)
	async Get( params={} ) {
		let data;
		
		if ( params.id ) {
			// single lookup — skip full scan
			const row = await this.adapter.indexGet(this.collection, params.id);
			data = row ? [row] : [];
		}
		else {
			data = await this.adapter.indexAll(this.collection);
		}
		
		// sorting
		if ( params.order_by ) {
			const flip = params.ascending===false ? -1 : 1;
			data.sort( (a, b) => {
				if ( a[params.order_by] < b[params.order_by] ) { return -1 * flip; }
				if ( a[params.order_by] === b[params.order_by] ) { return 0; }
				return 1 * flip;
			});
		}
		
		return data;	
	}
	
	// Get full scene data for a single record (heavy)
	async GetData( id ) {
		return await this.adapter.dataGet(this.collection, id);
	}

	// Export a full row (index + data merged) for file export
	async GetFullRow( id ) {
		const index = await this.adapter.indexGet(this.collection, id);
		const data = await this.adapter.dataGet(this.collection, id);
		if ( !index || !data ) { return null; }
		return { ...index, scene: data.scene };
	}
	
}		
