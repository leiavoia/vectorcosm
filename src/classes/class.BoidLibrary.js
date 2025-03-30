import * as utils from '../util/utils.js'
import {db} from '../classes/db.js'
import PubSub from 'pubsub-js'

export default class BoidLibrary {

	constructor() {
	
	}
	
	async Add( population, label=null ) {
		if ( !Array.isArray(population) ) { population = [population]; }
		if ( !label ) {
			let species = new Set( population.map( _ => _.genus==_.species ? _.genus : `${_.genus} ${_.species}` ) );
			label = species.size === 1 ? population[0].species : 'mixed';
		}
		const row = {
			species: label,
			date: Date.now(),
			count: population.length,
			star: 0,
			svg: null,
			specimens: population.map( _ => _.Export(true) )
		};
		return await this.AddRow(row);
	}
	
	async AddRow( row ) {
		return await db.populations.put(row)
		.then( _ => {
			PubSub.publish('boid-library-addition', null);
			return _;
		});
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		return await db.populations.put(row);
	}
	
	async Delete( id ) {
		return await db.populations.delete(id);
	}
	
	async Get( params ) {
		// id
		// date
		// species
		//
		// page
		// per_page
		// order_by
		// ascending
		
		let data = await db.populations;
		
		// filtering
		if ( params.id ) {
			data = data.where("id").equals(params.id);
		}
		if ( params.species ) {
			data = data.where("species").equalsIgnoreCase(params.species);
		}
		if ( params.hasOwnProperty('star') && params.star !== null ) {
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
	
}		
