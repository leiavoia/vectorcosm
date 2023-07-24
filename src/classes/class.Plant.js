
import Two from "two.js";
import * as utils from '../util/utils.js'

export default class Plant {
	constructor(x=0,y=0) {
		this.x = x;
		this.y = y;
		this.dead = false;
		this.geo = two.makeGroup();
		this.geo.position.x = x;
		this.geo.position.y = y;
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}	
}

export class PendantLettuce extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		const n = utils.BiasedRandInt( 3, 16, 8, 0.8 );
		const r = utils.BiasedRandInt( 50, 200, 100, 0.6);
		const max_variance = r*0.3; 
		const angles = [];
		const seglength = (2*Math.PI) / n;
		const pts = [];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = i * seglength + utils.BiasedRand( -seglength/2, seglength/2, 0, 0.8 ) ;
			pts.push([ l * Math.cos(a), l * Math.sin(a) ]);
		}
		// make the main body shape
		const lw = utils.BiasedRandInt( 1, 6, 2, 0.95 );
		let shape = window.two.makePath( pts.map( p => new Two.Anchor( p[0], p[1] ) ) );
		// shape.fill = "#AEA7";
		let stops = [ new Two.Stop(0, '#174D1F'), new Two.Stop(1, '#23682D') ];
		// shape.fill = new Two.RadialGradient(0, 0, r, new Two.Stop(0, '#181'), new Two.Stop(1, '#AEA') );
		shape.fill = window.two.makeRadialGradient(0, 0, r, ...stops );
		shape.fill.units = 'userSpaceOnUse'; // super important
		shape.linewidth = lw;
		shape.stroke = 'transparent';
		this.geo.add(shape);
		// dash pattern
		const dashes = [];
		let num_dashes = utils.RandomInt(0,3);
		for ( let i=0; i < num_dashes; i++ ) {
			dashes.push( utils.RandomInt(lw*0,lw*10) );
			dashes.push( utils.RandomInt(lw*0,lw*10) );
		}			
		// make the veins
		for ( let p of pts ) { 
			const l = window.two.makeLine( 0, 0, p[0], p[1] );
			l.stroke = "#697";
			// l.stroke = '#C4D';
			l.linewidth = lw;
			if ( dashes.length ) { l.dashes = dashes; }
			// l.cap = 'round';
			this.geo.add(l);
		}
	}
} 

export class VectorGrass extends Plant {
	constructor(x=0, y=0) {
		super(x,y);
		const n = utils.BiasedRandInt( 1, 5, 3, 0.8 );
		const r = utils.BiasedRandInt( 100, 500, 180, 0.6);
		const max_variance = r*0.3; 
		const spread = 0.3 * Math.PI; 
		const dashes = [2,2];
		for ( let i=0; i < n; i++ ) {
			const l = r + utils.RandomInt( -max_variance, max_variance );
			const a = 1.5*Math.PI + utils.BiasedRand( -spread, spread, 0, 0.65 ) ;
			const line = window.two.makeLine( 0, 0, l * Math.cos(a), l * Math.sin(a) );
			line.stroke = '#697';
			line.linewidth = r * utils.BiasedRand( 0.04, 0.2, 0.08, 0.5 );
			line.fill = 'transparent';
			if ( dashes.length ) { line.dashes = dashes; }
			this.geo.add(line);
		}
	}
} 

// export default class Plant {
// 	constructor(x=0,y=0,scale=1) {
// 		scale = utils.clamp(scale,0.1,10);
// 		this.x = x;
// 		this.y = y;
// 		let leaves = Math.trunc( Math.random() * 2 ) + 2;
// 		this.geo = two.makeGroup();
// 		for ( let i=0; i < leaves; i++ ) {
// 			let h = Math.random()*400*scale + 200;
// 			let w = Math.random()*300*scale + 200;
// 			let tip_x = x + ((w * Math.random() * 0.6) - (w * Math.random() * 0.3));
// 			let points = [
// 				(x + (Math.random() * 60 * scale)) - (30*scale), // root
// 				y+50,
// 				Math.max(x,tip_x) + Math.random() * w / 2,
// 				y - (Math.random() * h/2 + h/2),
// 				tip_x,
// 				y-h,
// 				Math.min(x,tip_x) - Math.random() * w / 2,
// 				y - (Math.random() * h/2 + h/2)
// 			];
// 			let path = two.makePath(...points);
// 			path.linewidth = 2;
// 			path.stroke = utils.adjustColor('#AEA1',0.1);
// 			path.fill = utils.adjustColor('#AEA2',0.1);
// 			this.geo.add( path );
// 		}
// 	}
// }
