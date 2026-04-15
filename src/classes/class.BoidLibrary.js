/* <AI>
BoidLibrary — IndexedDB persistence for saved boid populations.

OVERVIEW
- Split-table design: `population_index` (metadata) and `population_data` (serialized specimens).
- `Add(population[])` — serializes each boid with `boid.Export(true)`, stores to DB, returns id.
- `AddRow(row)` — import from file (row has index fields + `specimens` array).
- `Get(params)` — queries index table only (no specimen data). Filter by id, label, etc.
- `GetData(id)` — loads actual boid specimen data for one population.
- `Delete(id)` — removes both index and data rows.
- `Update(row)` — updates index fields only; never touches specimen data.
- `MakeLabel(population)` — auto-generates a display label from genus/species distribution.

EVENTS
- Publishes 'boid-library-addition' PubSub event on Add/Delete to trigger UI refresh.

RELATIONSHIPS
- Uses `db.js` (Dexie singleton).
- UI library panels subscribe to PubSub events to re-render on changes.
</AI> */

import * as utils from '../util/utils.js'
import {db} from '../classes/db.js'
import PubSub from 'pubsub-js'

export default class BoidLibrary {

	constructor() {
	
	}
	
	static MakeLabel( population ) {
		const genus_set = new Set( population.map( _ => _.genus ) );
		const species_set = new Set( population.map( _ => _.genus === _.species ? _.genus : `${_.genus} ${_.species}` ) );
		if ( species_set.size === 1 ) {
			// all same species: "Genus Species" or just "Genus" if genus==species
			const first = population[0];
			return first.genus === first.species ? first.genus : `${first.genus} ${first.species}`;
		}
		if ( genus_set.size === 1 ) {
			return population[0].genus;
		}
		return `Mixed (${species_set.size} species, ${genus_set.size} genus)`;
	}
	
	async Add( population, label=null ) {
		if ( !Array.isArray(population) ) { population = [population]; }
		if ( !label || typeof label !== 'string' ) {
			label = BoidLibrary.MakeLabel( population );
		}
		const genus_set = new Set( population.map( _ => _.genus ) );
		const species_set = new Set( population.map( _ => _.genus === _.species ? _.genus : `${_.genus} ${_.species}` ) );
		const index_row = {
			label: label,
			date: Date.now(),
			count: population.length,
			star: 0,
			num_species: species_set.size,
			num_genus: genus_set.size,
		};
		const id = await db.population_index.put(index_row);
		await db.population_data.put({
			id: id,
			specimens: population.map( _ => _.Export(true) ),
		});
		PubSub.publish('boid-library-addition', null);
		return id;
	}
	
	async AddRow( row ) {
		// for importing from file - row has index fields + specimens
		const specimens = row.specimens || [];
		delete row.specimens;
		delete row.selected;
		// don't let IDs in from the outside
		delete row.id;
		// handle legacy field name
		if ( row.species && !row.label ) {
			row.label = row.species;
			delete row.species;
		}
		const id = await db.population_index.put(row);
		await db.population_data.put({ id, specimens });
		PubSub.publish('boid-library-addition', null);
		return id;
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		// only update index fields, never touch data
		const { specimens, ...index_row } = row;
		return await db.population_index.put(index_row);
	}
	
	async Delete( id ) {
		await db.population_data.delete(id);
		return await db.population_index.delete(id);
	}
	
	// Get index rows only (lightweight, no specimen data)
	async Get( params ) {
		let data = db.population_index;
		
		// filtering
		if ( params.id ) {
			data = data.where("id").equals(params.id);
		}
		else if ( params.label ) {
			data = data.where("label").equalsIgnoreCase(params.label);
		}
		else if ( params.hasOwnProperty('star') && params.star !== null ) {
			data = data.where("star").equals(params.star);
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
	
	// Get full specimen data for a single record (heavy)
	async GetData( id ) {
		return await db.population_data.get(id);
	}

	// Export a full row (index + data merged) for file export
	async GetFullRow( id ) {
		const index = await db.population_index.get(id);
		const data = await db.population_data.get(id);
		if ( !index || !data ) { return null; }
		return { ...index, specimens: data.specimens };
	}
	
}		
