import * as utils from '../util/utils.js'
import {db} from '../classes/db.js'
import PubSub from 'pubsub-js'

export default class TankLibrary {

	async Add( tank, label=null ) {
		let now = Date.now();
		if ( !label ) {
			label = now;
		}
		const row = {
			label: label,
			date: now,
			tank: tank.Export(true)
		};
		return await this.AddRow(row);
	}
	
	async AddRow( row ) {
		return await db.tanks.put(row)
		.then( _ => {
			PubSub.publish('tank-library-addition', {id:_});
			return _;
		});
	}
	
	async Update( row ) {
		if ( !row.id ) { return false; }
		return await db.tanks.put(row);
	}
	
	async Delete( id ) {
		return await db.tanks.delete(id);
	}
	
	async Get( params ) {
		// id
		// date
		//
		// page
		// per_page
		// order_by
		// ascending
		
		let data = await db.tanks;
		
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
	
}		
