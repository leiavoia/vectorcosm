/* <AI>
 * Per-frame animation helpers for Vectorcosm render objects.
 * Extracted from App.svelte (Phase 2 decomposition).
 *
 * All functions mutate o.geo in place. No return value.
 * Dependencies passed as parameters — no module-level state.
 *
 * Exports: AnimateFood, AnimatePlant, AnimateMark, AnimateBoid
 * Called from: App.svelte frame loop (api.on 'frame' handler)
 * AnimateBoid imports Two.Vector from two.js for vertex math.
 * </AI> */

import Two from 'two.js';
import Mark from '../classes/class.Mark.js'; // needed for enum

// resize, fade in/out a food object based on its animation state
export function AnimateFood( o, camera ) {
	if ( !o.geo || !o.anim || camera.z < camera.animation_min ) { return; }
	// resize the food
	let radius = Math.max(o.anim.r,5); // note: it tracks its own radius instead of calculating from food value
	if ( radius != o.geo.radius ) { // limit expensive redraws
		o.geo.radius = radius;
		let circ = radius * 2 * Math.PI;
		let points = o.geodata.complexity;
		if ( o.geodata.complexity==7 ) { points=8; } // unicode doesnt have heptagons ;-(
		else if ( o.geodata.complexity==8 ) { points=12; } // getting hard to discern at this point
		let segment = circ / ( points * 2 );
		o.geo.linewidth = radius/2;
		if ( points > 2 ) { o.geo.dashes = [segment,segment]; }
		else if ( points == 2 ) { o.geo.dashes = [segment*0.5,segment*1.5]; }
	}
	// fade out
	if ( !o.geodata.permafood && o.anim.age > o.anim.lifespan - 1 ) {
		let pct = o.anim.age - (o.anim.lifespan-1);
		o.geo.opacity = 1-pct;
	}
	// fade in
	else if ( !o.geodata.permafood && o.anim.age < 3 ) {
		o.geo.opacity = Math.min( o.anim.age / 0.5, 1 );
		o.geo.scale = Math.min( o.anim.age / 1, 1 );
		o.geo.rotation = ( 1 - Math.pow(o.anim.age / 3, 0.25) ) * Math.PI + o.geodata.r;
	}
}

// sway, fade in/out a plant object based on its animation state
export function AnimatePlant( o, simStats ) {
	// note: dynamic animations cause jank unless we track animation cycle time per-plant.
	// optimization: we can calculate plant-is-in-frame before committing to animation.
	if ( !o.geo || !o.anim /* || camera.z < camera.animation_min */ ) { return; }
	// reenable plants turned off on loading. this dodges the first-frame pop.
	if ( !o.geo.visible ) { o.geo.visible = true; }
	// historical note: we used to base strength on local tank current,
	// but this is an unnecessary level of detail to get the effect.
	// instead, randomly assign a strength level to prevent uniformity.
	if ( !o.geodata.strength ) {
		o.geodata.strength = 0.2 + Math.random() * 0.5;
		// exceptionally large plants need lower sway to avoid motion sickness
		const dims = o.geo.getBoundingClientRect(true);
		const longest_dim = Math.max( dims.width, dims.height );
		if ( longest_dim > 600 ) { o.geodata.strength *= 0.5; }
	}
	let animation_time = ( simStats?.round_time ?? 0 ) * o.geodata.strength;
	// simple skew animation works for any plant type
	let rad = o.geodata.r || o.geodata.radius || 200; // not currently supplied by API
	let mod = 0.35 * ( 1.15-(rad/500) );
	o.geo.skewX = mod * Math.cos( animation_time );
	o.geo.skewY = mod * Math.sin( animation_time );
	// fade out
	if ( !o.anim.perma && o.anim.age > o.anim.lifespan - 8 ) {
		let diff = o.anim.age - (o.anim.lifespan-8);
		o.geo.opacity = 8-diff;
	}
	// fade in
	else if ( o.anim.age < 10 ) {
		o.geo.opacity = 0.5 + Math.min( o.anim.age / 20, 1 );
		o.geo.scale = Math.min( o.anim.age / 10, 1 );
	}
}

// fade in/out a mark (smell/sound/color trail) based on type and age
export function AnimateMark( o ) {
	// note: marks look good at a distance, so do not turn off animations based on camera zoom
	if ( !o.geo || !o.anim ) { return; }
	// fade in/out
	const max_opacity = 0.5;
	const fade_in = 0.65;
	const fade_out = 2;
	// smells linger
	if ( o.anim.sense_type == Mark.types.SMELL ) {
		if ( o.anim.age < fade_in ) {
			o.geo.opacity = max_opacity * ( o.anim.age / fade_in );
		}
		else if ( o.anim.age > o.anim.lifespan - fade_out ) {
			o.geo.opacity = max_opacity * ( (o.anim.lifespan - o.anim.age) / fade_out );
		}
	}
	// sounds and colors flash
	else {
		o.geo.opacity = Math.pow( 1 - o.anim.age / o.anim.lifespan, 4 );
	}
}

// animate boid body geometry - vertex-level deformation, larval unfold, opacity
export function AnimateBoid( b, camera, gameloop ) {
	if ( !b.geo || !b.anim ) { return; }

	// [!]EXPERIMENTAL - Animate geometry - proof of concept
	// There is just enough here to be amusing, but its not accurate and needs improvement
	if ( camera.animate_boids && gameloop.updates_per_frame <= 1 ) {

		const radius = 80; // good enough

		const do_animation = ( camera.z >= camera.animation_min )
			&& ( b.x - radius < camera.xmax )
			&& ( b.x + radius > camera.xmin )
			&& ( b.y - radius < camera.ymax )
			&& ( b.y + radius > camera.ymin );
			// you might also consider switching to pixel pitch method
			// && ( radius >= ( camera.xmax - camera.xmin ) / 100 )

		// dynamic animation - don't animate unless we're on screen and close enough to see
		if ( do_animation ) {

			// setup - record original position
			if ( !b.geo.vertices[0].origin ) {
				for ( let i=0; i < b.geo.vertices.length; i++ ) {
					let v = b.geo.vertices[i];
					v.origin = new Two.Vector().copy(v);
					v.a = Math.atan2( v.y, v.x ); // note y normally goes first
				}
			}
			if ( !b.anim.bounds ) {
				b.anim.bounds = b.geo.getBoundingClientRect(true);
			}

			// if we are a "larva", unfold from a sphere
			if ( b.anim.is_larva ) {
				// setup: sort vertices in radial order and assign starting positions
				if ( !( 'xp' in b.geo.vertices[0] ) ) {
					// the nose point is always at zero degrees
					for ( let i=0; i < b.geo.vertices.length; i++ ) {
						b.geo.vertices[i].a = i * ( ( 2*Math.PI ) / b.geo.vertices.length );
						b.geo.vertices[i].xp = Math.cos(b.geo.vertices[i].a) * Math.min(b.anim.bounds.width, b.anim.bounds.height) * 0.5;
						b.geo.vertices[i].yp = Math.sin(b.geo.vertices[i].a) * Math.min(b.anim.bounds.width, b.anim.bounds.height) * 0.5;
					}
				}
				// blend larval position and adult position
				const effect = 1 - b.anim.larva_pct;
				for ( let i=0; i<b.geo.vertices.length; i++ ) {
					let v = b.geo.vertices[i];
					v.x = v.xp + ( v.origin.x - v.xp ) * effect;
					v.y = v.yp + ( v.origin.y - v.yp ) * effect;
				}
			}

			// normal adult animation cycle
			else {
				for ( let m=0; m < b.anim.motor_fx.length; m++ ) {
					if ( m >= b.geo.vertices.length ) { break; }
					const effect = b.anim.motor_fx[m];
					const effect2 = effect;
					// other fun options:
					// const effect2 = Math.max( 0, Math.log(effect)+1 );
					// const effect2 = 0.5 * Math.sin( 1.5 * Math.PI + 2 * Math.PI * effect ) + 0.5;
					let v = b.geo.vertices[m];
					if ( !( 'xoff' in v ) ) {
						v.x = v.origin.x;
						v.y = v.origin.y;
						v.xoff = (0.1 + Math.random()) * 0.25 * b.anim.bounds.width * (Math.random() > 0.5 ? 1 : -1 );
						v.yoff = (0.1 + Math.random()) * 0.25 * b.anim.bounds.height * (Math.random() > 0.5 ? 1 : -1 );
						delete v.xp; delete v.xy; // larval stuff
					}
					v.x = v.origin.x + v.xoff * effect;
					// do opposing vertex
					const oppo_index = m==0 ? 0 : (b.geo.vertices.length - m);
					if ( oppo_index !== m ) {
						v.y = v.origin.y + v.yoff * effect2;
						const v2 = b.geo.vertices[oppo_index];
						if ( !( 'xoff' in v2 ) ) {
							v2.x = v2.origin.x;
							v2.y = v2.origin.y;
							v2.xoff = v.xoff;
							v2.yoff = -v.yoff;
						}
						v2.x = v2.origin.x + v2.xoff * effect;
						v2.y = v2.origin.y + v2.yoff * effect2;
					}
				}
			}

			// opacity
			if ( 'opacity' in b.anim ) { b.geo.opacity = b.anim.opacity; }
			else if ( b.geo.opacity < 1 ) { b.geo.opacity = 1; }
		}
	}
}
