import Two from "two.js";
import * as utils from '../util/utils.js'
import Delaunator from 'delaunator';
import {Point, Polygon, Result} from 'collisions';

export default class Rock {

	static color_schemes = {
		'Grey Marble': 		['#7d8488','#6f737a'],
		'Old Marble': 		['#a4bdb7'],
		'Light Copper Oxide':	['#67a197','#77a096','#7ca098'],
		'Sandstone': 			['#96806d','#A29276','#9c957b','#94735a','#8a7a77','#b1966c'],
		'Slate': 				['#AAAAAA','#999999'],
		'Wavebreak': 			['#878b8a','#4B4E50','#6c7471'],
		'Mossyrock': 			['#447047','#518545','#679c4f','#425345','#546b59'],
		'Pink Quartz': 			['#E0B69C','#C08A74','#E2B8A1','#9b6854','#cfcdcd','#c48865','#d8d0cd','#c2b7ac','#c4b6a8'],
	};
		
	// x, y (position)
	// w, h (box drawing mode)
	// complexity = INT num points in visual geometry
	// hull = list of [x,y] points to create hull in LOCAL SPACE
	// points = explicit list of points in LOCAL SPACE (useful for save/load)
	// force_corners = BOOL default true
	// new_points_respect_hull = BOOL default true. if false, new points can be outside hull
	constructor( params ) {
		this.oid = ++globalThis.vc.next_object_id;
		this.sense = new Array(16).fill(0);
		this.sense[0] = 0.2; // dull grey appearance
		this.sense[1] = 0.2;
		this.sense[2] = 0.2;
		// the object can either be a saved object with all data
		if ( params.collision ) {	
			Object.assign( this, params );	
			this.collision.qid = 0; // must reset this on loaded objects
		}
		// or parameters to build a new rock from scratch
		else {
			params = Object.assign({
				// default options if not present:
				new_points_respect_hull: true
			}, params);
		}
		// create the rock from scratch if this is not from a saved object
		if ( !this.collision ) {
			// position in space
			this.x = params.x;
			this.y = params.y;
			// setup internal list of points
			this.pts = [];
			if ( 'points' in params ) { this.pts = params.points; }
			else if ( 'pts' in params ) { this.pts = params.pts; } // alias
			// box drawing model
			if ( 'h' in params && 'w' in params ) {
				// bounding volume - normalize the values to start at zero
				this.y1 = 0;
				this.x1 = 0;
				this.x2 = params.w;
				this.y2 = params.h;
				// place points on exact corners		
				if ( params.force_corners ) {
					this.pts.push([this.x1,this.y1]);
					this.pts.push([this.x2,this.y1]);
					this.pts.push([this.x2,this.y2]);
					this.pts.push([this.x1,this.y2]);
				}
				// at least one point must touch each side.
				else {
					this.pts.push([ utils.RandomInt(0,this.x2), 0 ]); // top
					this.pts.push([ utils.RandomInt(0,this.x2), this.y2 ]); // bottom
					this.pts.push([ 0, utils.RandomInt(0,this.y2) ]); // left
					this.pts.push([ this.x2, utils.RandomInt(0,this.y2) ]); // right
					// aesthetics: add more points nearby to reduce sharp points
					if ( params.blunt ) {
						if ( params.blunt===true ) { params.blunt=1; }
						const max_jitter = 0.35;
						const min_jitter = 0.15;
						for ( let p=0; p < params.blunt; p++ ) {
							for ( let i=0; i<4; i++ ) {
								const jitter = Math.random() * (max_jitter - min_jitter) + min_jitter; 
								const damp_x = i < 2 ? 1 : 0.2 ;
								const damp_y = i >= 2 ? 1 : 0.2 ;
								this.pts.push([
									this.pts[i][0] + (params.w * jitter * damp_x) - (params.w * jitter * 0.5 * damp_x),
									this.pts[i][1] + (params.h * jitter * damp_y) - (params.h * jitter * 0.5 * damp_y)
								]);
							}
						}
					}
				}
			}
			// hull mode
			else if ( 'hull' in params ) {
				this.pts = params.hull;
			}
			// reel in points out of bounds
			for ( let p of this.pts )  {
				if ( p[0] + this.x < 0 ) { p[0] = -this.x; }
				else if ( p[0] + this.x > globalThis.vc.tank.width ) { p[0] = globalThis.vc.tank.width - this.x; }
				if ( p[1] + this.x < 0 ) { p[1] = -this.x; }
				else if ( p[1] + this.y > globalThis.vc.tank.height ) { p[1] = globalThis.vc.tank.height - this.y; }
			}
			// recalculate bounds in case adjustments were made
			this.x1 = 0;
			this.y1 = 0;
			this.x2 = 0;
			this.y2 = 0;
			for ( let p of this.pts ) {
				if ( p[0] > this.x2 ) { this.x2 = p[0]; }
				if ( p[1] > this.y2 ) { this.y2 = p[1]; }
			}
			// make note of the convex hull for collision detection
			this.collision = {
				shape: 'polygon',
				fixed: true,
				hull: [],
				aabb: { x1: 0, y1: 0, x2:this.x2, y2:this.y2 }, // we already know this and don't need to compute
				qid: 0
			};
			let delaunay = Delaunator.from(this.pts);
			for ( let i of delaunay.hull ) {
				this.collision.hull.push( [ 
					this.pts[i][0], // + this.x, 
					this.pts[i][1], // + this.y, 
				] )
			}
			this.collision.hull.reverse(); // reverse for collision compatibility
			// create random set of points INSIDE the hull
			let complexity = !params.hasOwnProperty('complexity') ? utils.RandomInt(0,7) : Math.max( 0, params.complexity );
			for ( let n=0; n < complexity; n++ ) {
				let attempts = 0;
				while ( attempts < 10 ) {
					let p = [ utils.RandomInt(0,this.x2), utils.RandomInt(0,this.y2) ];
					if ( params.new_points_respect_hull && !this.PointInHull( p[0], p[1], this.collision.hull ) ) { 
						attempts++; 
						continue; 
						}
					this.pts.push(p);
					break;
				}
			}
			// refactor triangulation
			delaunay = Delaunator.from(this.pts);
			this.collision.hull = [];
			for ( let i of delaunay.hull ) {
				this.collision.hull.push( [ 
					this.pts[i][0], // + this.x, 
					this.pts[i][1], // + this.y, 
				] )
			}
			this.collision.hull.reverse(); // reverse for collision compatibility
			
			// make triangles, even if we don't use them in the current rendering mode
			const color_scheme = Rock.color_schemes[params.color_scheme] || Object.values(Rock.color_schemes).pickRandom();
			const height = this.y2 - this.y1;
			let triangles = delaunay.triangles;
			this.triangles = [];
			for (let i = 0; i < triangles.length; i += 3) {
				// color
				let c = color_scheme[ Math.trunc( Math.random() * color_scheme.length ) ]; 
				
				// shade colors to illuminate topside
				const color_variance = 0.9;
				const center = (this.pts[triangles[i]][1] + this.pts[triangles[i+1]][1] + this.pts[triangles[i+2]][1]) / 3;
				const r = (0.5-(center/height)) * color_variance + (Math.random()*color_variance*0.5-0.5); 
				c = utils.adjustColor(c,r);
				
				// keep these to serialize the object later
				this.triangles.push([
					this.pts[triangles[i]][0], 
					this.pts[triangles[i]][1], 
					this.pts[triangles[i+1]][0], 
					this.pts[triangles[i+1]][1], 
					this.pts[triangles[i+2]][0], 
					this.pts[triangles[i+2]][1],
					c
				]);
			}
		}
	}
	Kill() {
		// this.geo.remove();
		this.dead = true;
	}
	PointInHull( x, y, hull ) {
		const pt  = new Point(x, y);
		const polygon = new Polygon(0,0,hull);
		const result  = new Result();
		return !!pt.collides(polygon, result);
	}
	Export( as_JSON=false ) {
		let output = {};
		this.collision.qid = 0; // don't save this. ok to reset
		let datakeys = ['x','y','collision','triangles','pts'];		
		for ( let k of datakeys ) { output[k] = this[k]; }
		if ( as_JSON ) { output = JSON.stringify(output); }
		return output;
	}
	GeoData() {
		return {
			triangles: this.triangles,
			hull: this.collision.hull
		}
	}

}