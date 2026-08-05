/* <AI>
Mark — ephemeral spatial sensory marker. 
Can be created from a number situations and carries visual, smell, and audio cues.

OVERVIEW
- Short-lived circle with a `sense[]` (16 channels) encoding the signal type and intensity.
- `collision` — registered as a circle with radius `r` for sensor queries.

CHANNELS
- [0..2]: visual (RGB)
- [3..10]: smell
- [11]: complexity
- [12..15]: audio / custom

UPDATE
- `Update(delta)` — ages by delta; calls `Kill()` when lifespan exceeded.
- `GeoData()` — returns a colored ring outline (color maps to `strongest_sense` index).

USAGE
- Boids create Marks to leave trail signals or communicate local state.
- Sensors of type 'sense' detect marks in range and read their `sense[]` values.
</AI> */

import { createCircleCollider } from './collision.js';

export default class Mark {

	static types = {
		GENERIC: 0,
		VISUAL: 1,
		SMELL: 2,
		AUDIO: 3,
		BITE: 4,
		ATTACK: 5
	};
	
	constructor(params) {
		this.oid = ++globalThis.vc.next_object_id;
		// defaults
		this.x = 0;
		this.y = 0;
		this.r = 100;
		this.age = 0;
		this.lifespan = 10;
		this.sense = new Array(15).fill(0);
		this.type = Mark.types.GENERIC;
		this.dead = false;		
		Object.assign( this, params );
		this.collision = createCircleCollider( this.r );
	}
	Export( as_JSON=false ) {
		let output = {};
		let datakeys = ['x','y','r','age','lifespan','sense','type'];		
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
		
		// basic white circle if there is no type info
		let geo = { 
			type:'circle', 
			r: this.r,
			fill: 'transparent',
			stroke: '#ffffff',
			opacity: 0.5,
		};
		
		// Smell:
		if ( this.type==Mark.types.SMELL ) {
			// smell has two channels over 6 sense slots: 6,7,8,9,10,11
			// extract a representative color by converting the average 
			// of the color positions from two channels, adjusting
			// with amplitude data from each channel
			const primary_hue_cos = this.sense[6];
			const primary_hue_sin = this.sense[7];
			const primary_amp = Math.max( 0.4, Math.tanh( 0.5 * this.sense[8] ) ); // these can go over 1.0
			const secondary_hue_cos = this.sense[9];
			const secondary_hue_sin = this.sense[10];
			const secondary_amp = Math.max( 0.4, Math.tanh( 0.75 * this.sense[11] ) ); // these can go over 1.0
			// map the cos/sin to a value on the color wheel
			const primary_hue = Math.atan2(primary_hue_sin, primary_hue_cos);
			const secondary_hue = Math.atan2(secondary_hue_sin, secondary_hue_cos);
			// average together using modular arithmetic
			const avg_hue = Math.atan2(
				Math.sin(primary_hue) * primary_amp + Math.sin(secondary_hue) * secondary_amp,
				Math.cos(primary_hue) * primary_amp + Math.cos(secondary_hue) * secondary_amp
			);
			// create an HSL color from hue and amplitude
			geo.stroke = `hsl(${(avg_hue * 180 / Math.PI + 360) % 360}, ${secondary_amp * 100}%, ${primary_amp * 70}%)`;
			geo.linewidth = 6;
			geo.dashes = [6,24];
		}
		// Visual:
		else if ( this.type==Mark.types.VISUAL ) {
			// visual has two channels over 6 sense slots: 0,1,2,3,4,5
			// conceptually this represents color (0,1,2) and texture (3,4,5)
			// extract a representative color by converting the average 
			// of the color positions from two channels, adjusting
			// with amplitude data from each channel
			const primary_hue_cos = this.sense[0];
			const primary_hue_sin = this.sense[1];
			const primary_amp = Math.max( 0.4, Math.tanh( 0.5 * this.sense[2] ) ); // these can go over 1.0
			const secondary_hue_cos = this.sense[3];
			const secondary_hue_sin = this.sense[4];
			const secondary_amp = Math.max( 0.4, Math.tanh( 0.75 * this.sense[5] ) ); // these can go over 1.0
			// map the cos/sin to a value on the color wheel
			const primary_hue = Math.atan2(primary_hue_sin, primary_hue_cos);
			const secondary_hue = Math.atan2(secondary_hue_sin, secondary_hue_cos);
			// average together using modular arithmetic
			const avg_hue = Math.atan2(
				Math.sin(primary_hue) * primary_amp + Math.sin(secondary_hue) * secondary_amp,
				Math.cos(primary_hue) * primary_amp + Math.cos(secondary_hue) * secondary_amp
			);
			// create an HSL color from hue and amplitude
			geo.stroke = `hsl(${(avg_hue * 180 / Math.PI + 360) % 360}, ${secondary_amp * 100}%, ${primary_amp * 70}%)`;		
			geo.linewidth = 10;
			geo.dashes = [40,10];
		}
		// Audio:
		else if ( this.type==Mark.types.AUDIO ) {
			// audio has one channel over sense slots 12,13,14
			// extract a representative color by by finding color wheel position.
			const primary_hue_cos = this.sense[12];
			const primary_hue_sin = this.sense[13];
			const primary_amp = Math.max( 0.4, Math.tanh( 0.5 * this.sense[14] ) ); // these can go over 1.0
			// map the cos/sin to a value on the color wheel
			const primary_hue = Math.atan2(primary_hue_sin, primary_hue_cos);
			// create an HSL color from hue and amplitude
			geo.stroke = `hsl(${(primary_hue * 180 / Math.PI + 360) % 360}, 100%, ${primary_amp * 70}%)`;
			geo.linewidth = 80;
			geo.dashes = [8,48];
		}
		// Bite (audio): - we dont care about the color too much.
		// bright white pop sends the right signal to viewers.
		else if ( this.type==Mark.types.BITE ) { 
			geo.linewidth = 8;
			geo.dashes = [2,16];
			geo.stroke = '#FFF';
		}
		// Attack (multi-sensory, "X" pattern):
		else if ( this.type==Mark.types.ATTACK ) {
			geo = { 
				type:'group',
				children: [
					{
						type: 'line',
						x1:-this.r,
						y1:-this.r,
						x2: this.r,
						y2: this.r,
						fill: 'transparent',
						linewidth: 10,
						stroke: '#D11',
						opacity: 0.8,
					},
					{
						type: 'line',
						x1:-this.r,
						y1: this.r,
						x2: this.r,
						y2:-this.r,
						fill: 'transparent',
						linewidth: 10,
						stroke: '#D11',
						opacity: 0.8,
					}
				] 
			};				
		}
				
		return geo;
	}
	Kill() {
		this.dead = true;
	}
}