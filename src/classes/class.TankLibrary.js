import * as utils from '../util/utils.js'
import {db} from '../classes/db.js'
import PubSub from 'pubsub-js'

export default class TankLibrary {

	async Add( scene, label=null, meta={} ) {
		let now = Date.now();
		if ( !label ) {
			label = now;
		}
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
		const id = await db.tank_index.put(index_row);
		await db.tank_data.put({ id, scene });
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
		await db.tank_index.put(index_row);
		await db.tank_data.put({ id, scene });
		PubSub.publish('tank-library-addition', { id });
		return id;
	}
	
	async AddRow( row ) {
		// for importing from file - row has index fields + scene
		const scene = row.scene || {};
		delete row.scene;
		// don't let IDs in from the outside
		delete row.id;
		const id = await db.tank_index.put(row);
		await db.tank_data.put({ id, scene });
		PubSub.publish('tank-library-addition', { id });
		return id;
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		// only update index fields
		const { scene, ...index_row } = row;
		return await db.tank_index.put(index_row);
	}
	
	async Delete( id ) {
		await db.tank_data.delete(id);
		return await db.tank_index.delete(id);
	}
	
	// Get index rows only (lightweight, no scene data)
	async Get( params={} ) {
		let data = db.tank_index;
		
		// filtering
		if ( params.id ) {
			data = data.where("id").equals(params.id);
		}
		
		data = await data.toArray();
		
		// sorting
		if ( params.order_by ) {
			const flip = params.ascending===false ? -1 : 1;
			let sortfunc = (a,b) => {
				if ( a[params.order_by] < b[params.order_by] ) return -1 * flip;
				if ( a[params.order_by] === b[params.order_by] ) return  0;
				if ( a[params.order_by] > b[params.order_by] ) return  1 * flip;
			}
			data.sort(sortfunc);
		}
		
		return data;	
	}
	
	// Get full scene data for a single record (heavy)
	async GetData( id ) {
		return await db.tank_data.get(id);
	}

	// Export a full row (index + data merged) for file export
	async GetFullRow( id ) {
		const index = await db.tank_index.get(id);
		const data = await db.tank_data.get(id);
		if ( !index || !data ) { return null; }
		return { ...index, scene: data.scene };
	}
	
}		
