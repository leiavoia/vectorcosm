import Two from "two.js";
import * as utils from '../util/utils.js'
import Delaunator from 'delaunator';
import {Point, Polygon, Result} from 'collisions';

export default class Rock {
	// x, y (position)
	// w, h (box drawing mode)
	// complexity = INT num points in visual geometry
	// hull = list of [x,y] points to create hull in LOCAL PSACE
	// points = explicit list of points in LOCAL SPACE (useful for save/load)
	// force_corners = BOOL default true
	// new_points_respect_hull = BOOL default true. if false, new points can be outside hull
	constructor( params ) {
		params = Object.assign({
			new_points_respect_hull: true
		}, params);
		// drawing geometry
		this.geo = window.two.makeGroup();
		this.geo.position.x = params.x;
		this.geo.position.y = params.y;
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
			}
		}
		// hull mode
		else if ( 'hull' in params ) {
			this.pts = params.hull;
		}
		// calculate bounds if we dont already have them
		if ( !this.x2 || !this.y2 ) {
			this.x2 = 0;
			this.y2 = 0;
			for ( let p of this.pts ) {
				if ( p[0] > this.x2 ) { this.x2 = p[0]; }
				if ( p[1] > this.y2 ) { this.y2 = p[1]; }
			}
		}
		// make note of the convex hull for collision detection
		this.collision = {
			shape: 'polygon',
			fixed: true,
			hull: [],
			aabb: { x1: 0, y1: 0, x2:this.x2, y2:this.y2 } // we already know this and don't need to compute
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
		let complexity = !params.complexity ? utils.RandomInt(1,7) : Math.max( 1, params.complexity );
		for ( let n=0; n < complexity; n++ ) {
			let attempts = 0;
			while ( attempts < 10 ) {
				let p = [ utils.RandomInt(0,this.x2), utils.RandomInt(0,this.y2) ];
				console.log(p);
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
		// make triangles
		const color_scheme = ['#070808','#4B4E50','#070808','#4B4E50','#9ba1a5']; // speckled granite
		let triangles = delaunay.triangles;
		for (let i = 0; i < triangles.length; i += 3) {
			let c = color_scheme[ Math.trunc( Math.random() * color_scheme.length ) ]; 
			let t = window.two.makePath(
				this.pts[triangles[i]][0], 
				this.pts[triangles[i]][1], 
				this.pts[triangles[i+1]][0], 
				this.pts[triangles[i+1]][1], 
				this.pts[triangles[i+2]][0], 
				this.pts[triangles[i+2]][1] 
				);
			// t.linewidth = 1;
			// t.fill = c;
			// t.stroke = c;
			t.linewidth = 1;
			t.fill = '#FFFFFF' + utils.DecToHex(utils.RandomInt(64,128));
			t.stroke = 'white';
			this.geo.add(t);
		}
		window.vc.AddShapeToRenderLayer(this.geo,'-1'); // slight background
	}
	Kill() {
		this.geo.remove();
		this.dead = true;
	}
	PointInHull( x, y, hull ) {
		const pt  = new Point(x, y);
		const polygon = new Polygon(0,0,hull);
		const result  = new Result();
		return !!pt.collides(polygon, result);
	}
}