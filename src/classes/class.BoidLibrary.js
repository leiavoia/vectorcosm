/* <AI>
BoidLibrary — Persistence for saved boid populations via a pluggable StorageAdapter.

OVERVIEW
- `Add(population[])` — serializes each boid with `boid.Export(true)`, stores, returns id.
- `AddRow(row)` — import from file (row has index fields + `specimens` array).
- `Get(params)` — returns index rows only (no specimen data). Filter by id, label, star.
- `GetData(id)` — loads actual boid specimen data for one population.
- `Delete(id)` — removes both index and data.
- `Update(row)` — updates index fields only; never touches specimen data.
- `MakeLabel(population)` — auto-generates a display label from genus/species distribution.

ADAPTER
- Set `BoidLibrary.default_adapter` once at startup (before any instantiation).
  Browser worker: DexieAdapter. CLI: FileAdapter or MemoryAdapter.
- Or pass per-instance: `new BoidLibrary(myAdapter)`.
- `Get(params)` filtering is done in JS (adapter interface is generic — no query DSL).

EVENTS
- Publishes 'boid-library-addition' PubSub event on Add/Delete to trigger UI refresh.
</AI> */

import * as utils from '../util/utils.js'
import PubSub from 'pubsub-js'

export default class BoidLibrary {

	// set once at startup before first instance; fallback null causes errors
	static default_adapter = null;
	static collection = 'boids';

	constructor( adapter = null ) {
		this.adapter = adapter ?? BoidLibrary.default_adapter;
		this.collection = BoidLibrary.collection;
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
		const id = await this.adapter.indexPut(this.collection, index_row);
		await this.adapter.dataPut( this.collection, id, { id, specimens: population.map( _ => _.Export(true) ) } );
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
		const id = await this.adapter.indexPut(this.collection, row);
		await this.adapter.dataPut(this.collection, id, { id, specimens });
		PubSub.publish('boid-library-addition', null);
		return id;
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		// only update index fields, never touch data
		const { specimens, ...index_row } = row;
		return await this.adapter.indexPut(this.collection, index_row);
	}
	
	async Delete( id ) {
		await this.adapter.dataDelete(this.collection, id);
		return await this.adapter.indexDelete(this.collection, id);
	}
	
	// Get index rows only (lightweight, no specimen data)
	async Get( params ) {
		let data;
		
		if ( params.id ) {
			// single lookup — skip full scan
			const row = await this.adapter.indexGet(this.collection, params.id);
			data = row ? [row] : [];
		}
		else {
			data = await this.adapter.indexAll(this.collection);
			// filtering
			if ( params.label ) {
				const l = params.label.toLowerCase();
				data = data.filter( r => r.label?.toLowerCase() === l );
			}
			else if ( params.hasOwnProperty('star') && params.star !== null ) {
				data = data.filter( r => r.star === params.star );
			}
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
	
	// Get full specimen data for a single record (heavy)
	async GetData( id ) {
		return await this.adapter.dataGet(this.collection, id);
	}

	// Export a full row (index + data merged) for file export
	async GetFullRow( id ) {
		const index = await this.adapter.indexGet(this.collection, id);
		const data = await this.adapter.dataGet(this.collection, id);
		if ( !index || !data ) { return null; }
		return { ...index, specimens: data.specimens };
	}
	
}		
