export default class Mark {
	constructor(params) {
		this.oid = ++globalThis.vc.next_object_id;
		// defaults
		this.x = 0;
		this.y = 0;
		this.r = 100;
		this.age = 0;
		this.lifespan = 10;
		this.sense = new Array(16).fill(0);
		this.dead = false;		
		Object.assign( this, params );
		this.collision = { radius: this.r, shape: 'circle' };
		// find the sense with the highest value and just show the corresponding color
		let highest = 0;
		this.strongest_sense = 0;
		for ( let i=0; i<this.sense.length; i++ ) {
			if ( this.sense[i] > highest ) {
				highest = this.sense[i];
				this.strongest_sense = i;
			}
		}
		// if the highest sense we got was zero, somebody didn't read the documentation
		if ( !highest ) {
			this.Kill(); 
			return;
		}
	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','r','age','lifespan','sense'];		
		for ( let k of datakeys ) { 
			if ( k in this ) {
				output[k] = this[k]; 
			}
		}
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}	
	Update(delta) {
		if ( !delta ) { return; }
		if ( delta > 1 ) { delta /= 1000; }
		this.age += delta;
		if ( this.age > this.lifespan ) {
			this.Kill();
			return;
		}
	}
	GeoData() {
		
		// colors hardcoded mostly for aesthetics. you could change them.
		let colors = [
			// colors		
			'#C42452',
			'#5DD94D',
			'#1F4BE3',
			// smells
			'#C42452',
			'#EB9223',
			'#EBE313',
			'#5DD94D',
			'#2CAED4',
			'#1F4BE3',
			'#991FE3',
			'#FF70E5',
			'#FFFFFF',
			'#666666',
			// audio
			'#6565ce',
			'#18b691',
			'#D5B000',
			'#FFB1BE',
		];
		
		let geo = { 
			type:'circle', 
			r: this.r,
			fill: 'transparent',
			stroke: colors[this.strongest_sense],
			opacity: 0.5,
		};
		
		// Audio:
		if ( this.strongest_sense >= 12) { 
			geo.linewidth = 80;
			geo.dashes = [8,48];
		}
		// Smell:
		else if ( this.strongest_sense >= 3 ) { 
			geo.linewidth = 6;
			geo.dashes = [6,24];
		}
		// Visual:
		else { 
			geo.linewidth = 10;
			geo.dashes = [40,10];
		}
		
		return geo;
		
		// // fade in/out
		// const max_opacity = 0.5;
		// const fade_in = 0.65;
		// const fade_out = 2;
		// if ( globalThis.vc.animate_boids && globalThis.vc.show_markers ) {
		// 	// smells linger
		// 	if ( this.strongest_sense >= 3 && this.strongest_sense < 12 ) {
		// 		if ( this.age < fade_in ) {
		// 			geo.opacity = max_opacity * ( this.age / fade_in );
		// 		}
		// 		else if ( this.age > this.lifespan - fade_out ) {
		// 			geo.opacity = max_opacity * ( (this.lifespan - this.age) / fade_out );
		// 		}
		// 	}
		// 	// sounds and colors flash
		// 	else {
		// 		geo.opacity = Math.pow( 1 - this.age / this.lifespan, 20 );
		// 	}
		// 	// geo.rotation += 0.2 * delta; // egregious eye candy
		// }
		
	}
	Kill() {
		this.dead = true;
	}
}