import Two from "two.js";
import * as utils from '../util/utils.js'
import Delaunator from 'delaunator';

export default class Rock {
	constructor(x1,y1,w,h,complexity) {
		// drawing geometry
		this.geo = window.two.makeGroup();
		this.geo.position.x = x1;
		this.geo.position.y = y1;
		// position in space
		this.x = x1;
		this.y = y1;
		// bounding volume - normalize the values to start at zero
		this.x1 = 0;
		this.y1 = 0;
		this.x2 = w;
		this.y2 = h;
		// create random set of point inside. at least one point must touch each side.
		this.pts = [];
		// this.pts.push([this.x1,this.y1]);
		// this.pts.push([this.x2,this.y1]);
		// this.pts.push([this.x2,this.y2]);
		// this.pts.push([this.x1,this.y2]);
		this.pts.push([ utils.RandomInt(0,this.x2), 0 ]); // top
		this.pts.push([ utils.RandomInt(0,this.x2), this.y2 ]); // bottom
		this.pts.push([ 0, utils.RandomInt(0,this.y2) ]); // left
		this.pts.push([ this.x2, utils.RandomInt(0,this.y2) ]); // right
		complexity = !complexity ? utils.RandomInt(1,7) : Math.min( 1, complexity );
		for ( let n=0; n < complexity; n++ ) {
			this.pts.push( [ utils.RandomInt(0,this.x2), utils.RandomInt(0,this.y2) ] );
		}
		// make triangles
		const color_scheme = ['#070808','#4B4E50','#070808','#4B4E50','#9ba1a5']; // speckled granite
		const delaunay = Delaunator.from(this.pts);
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
		// make note of the convex hull for collision detection
		this.collision = {
			shape: 'polygon',
			fixed: true,
			hull: [],
			aabb: { x1: 0, y1: 0, x2:this.x2, y2:this.y2 } // we already know this and don't need to compute
		};
		for ( let i of delaunay.hull ) {
			this.collision.hull.push( [ 
				this.pts[i][0], // + this.x, 
				this.pts[i][1], // + this.y, 
			] )
		}
		this.collision.hull.reverse();
	}
	
}