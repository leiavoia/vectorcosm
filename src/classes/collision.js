/* <AI>
collision.js — Custom collision detection module replacing 'collisions' npm library.

EXPORTS:
  Constants: SHAPE_CIRCLE, SHAPE_POLYGON
  Factories: createCircleCollider(radius), createPolygonCollider(x, y, points, scale)
  Tests:     testCirclePolygon(cx,cy,cr, poly, result) — HOT per-frame
             testCircleCircle(ax,ay,ar, bx,by,br, result) — lightweight
             testPolygonPolygon(a, b, result) — init-only
  Utility:   pointInPolygon(px, py, poly)
             translateCollider(collider, dx, dy)
             createResult(), clearResult(r)

COLLIDER SHAPE (monomorphic hidden class for V8 IC optimization):
  All collidable objects share the same property layout regardless of shape.
  { type, qid, radius, fixed, coords, edges, normals, vertex_count, aabb }
  Circles set polygon fields to null/0.

PERFORMANCE:
  testCirclePolygon is the hot function. Flat Float64Array access, no allocation,
  no function calls, one sqrt only on confirmed collision. Bounding circle
  pre-rejection before SAT.
</AI> */

// shape type constants
export const SHAPE_CIRCLE = 0;
export const SHAPE_POLYGON = 1;

// ── Factory: Circle Collider ──────────────────────────────────────
export function createCircleCollider( radius ) {
	return {
		type: SHAPE_CIRCLE,
		qid: 0,
		radius: radius,
		fixed: false,
	};
}

// ── Factory: Polygon Collider ─────────────────────────────────────
// points: array of [x,y] pairs in LOCAL space (relative to center).
// x, y: world-space center position.
// scale: optional uniform scale factor (default 1). Used for padded colliders.
// NOTE: aabb is stored in LOCAL space (relative to owner x,y) for SpaceGrid compatibility.
// SpaceGrid.Add() computes world AABB as o.x + aabb.x1, etc.
export function createPolygonCollider( x, y, points, scale ) {
	const n = points.length;
	const n2 = n * 2;
	const s = scale || 1;
	const coords = new Float64Array( n2 );
	const edges = new Float64Array( n2 );
	const normals = new Float64Array( n2 );

	// compute world-space coords (translate + optional scale, no rotation)
	let local_min_x = 1e30, local_min_y = 1e30, local_max_x = -1e30, local_max_y = -1e30;
	let max_r_sq = 0;
	for ( let i = 0, ix = 0; i < n; i++, ix += 2 ) {
		const lx = points[i][0] * s;
		const ly = points[i][1] * s;
		coords[ix] = lx + x;
		coords[ix + 1] = ly + y;
		if ( lx < local_min_x ) { local_min_x = lx; }
		if ( lx > local_max_x ) { local_max_x = lx; }
		if ( ly < local_min_y ) { local_min_y = ly; }
		if ( ly > local_max_y ) { local_max_y = ly; }
		// bounding radius from center
		const rsq = lx * lx + ly * ly;
		if ( rsq > max_r_sq ) { max_r_sq = rsq; }
	}

	// compute edges and normals
	for ( let ix = 0, iy = 1; ix < n2; ix += 2, iy += 2 ) {
		const next = ix + 2 < n2 ? ix + 2 : 0;
		const ex = coords[next] - coords[ix];
		const ey = coords[next + 1] - coords[iy];
		const len = ex || ey ? Math.sqrt( ex * ex + ey * ey ) : 0;
		edges[ix] = ex;
		edges[iy] = ey;
		normals[ix] = len ? ey / len : 0;
		normals[iy] = len ? -ex / len : 0;
	}

	return {
		type: SHAPE_POLYGON,
		qid: 0,
		radius: Math.sqrt( max_r_sq ), // bounding circle radius for cheap rejection
		fixed: true,
		coords: coords,
		edges: edges,
		normals: normals,
		vertex_count: n,
		aabb: { x1: local_min_x, y1: local_min_y, x2: local_max_x, y2: local_max_y },
		// world-space origin used for bounding circle pre-rejection
		cx: x,
		cy: y,
	};
}

// ── Translate Collider In-Place ───────────────────────────────────
// Cheap O(vertices) shift. Used during SeparateRocks iteration.
export function translateCollider( c, dx, dy ) {
	const coords = c.coords;
	const n2 = c.vertex_count * 2;
	for ( let i = 0; i < n2; i += 2 ) {
		coords[i] += dx;
		coords[i + 1] += dy;
	}
	c.cx += dx;
	c.cy += dy;
	// Note: edges, normals are direction vectors — unaffected by translation.
	// Note: aabb is local-space (relative to owner position) — unaffected by translation.
}

// ── Result Object ─────────────────────────────────────────────────
export function createResult() {
	return { collision: false, overlap: 0, overlap_x: 0, overlap_y: 0 };
}
export function clearResult( r ) {
	r.collision = false;
	r.overlap = 0;
	r.overlap_x = 0;
	r.overlap_y = 0;
}

// ── Circle vs Polygon SAT ────────────────────────────────────────
// THE HOT FUNCTION. Runs 100s-1000s of times per frame.
// Direct port of polygonCircle() from collisions library with all overhead stripped.
// Pre-computed coords/edges/normals read directly from polygon collider.
// No allocation, no dispatch, no dirty checks. One sqrt only when overlap needed.
// poly = polygon collider object (from createPolygonCollider)
// result = pre-allocated result object
// Returns true if colliding. Writes overlap into result.
export function testCirclePolygon( cx, cy, cr, poly, result ) {
	const coords = poly.coords;
	const edges = poly.edges;
	const norms = poly.normals;
	const count = poly.vertex_count * 2; // element count in typed arrays
	const cr2 = cr * cr;
	const cr_dbl = cr * 2;

	// bounding circle pre-rejection
	const bdx = cx - poly.cx;
	const bdy = cy - poly.cy;
	const br = cr + poly.radius;
	if ( bdx * bdx + bdy * bdy > br * br ) {
		result.collision = false;
		return false;
	}

	let overlap = null;
	let overlap_x = 0;
	let overlap_y = 0;
	let a_in_b = true;
	let b_in_a = true;

	for ( let ix = 0, iy = 1; ix < count; ix += 2, iy += 2 ) {
		const coord_x = cx - coords[ix];
		const coord_y = cy - coords[iy];
		const edge_x = edges[ix];
		const edge_y = edges[iy];
		const dot = coord_x * edge_x + coord_y * edge_y;
		const edge_len_sq = edge_x * edge_x + edge_y * edge_y;
		const region = dot < 0 ? -1 : dot > edge_len_sq ? 1 : 0;

		let tmp_overlapping = false;
		let tmp_overlap = 0;
		let tmp_overlap_x = 0;
		let tmp_overlap_y = 0;

		if ( a_in_b && coord_x * coord_x + coord_y * coord_y > cr2 ) {
			a_in_b = false;
		}

		if ( region ) {
			// circle center is in vertex region — test closest vertex
			const left = region === -1;
			const other_x = left ? ( ix === 0 ? count - 2 : ix - 2 ) : ( ix === count - 2 ? 0 : ix + 2 );
			const other_y = other_x + 1;
			const coord2_x = cx - coords[other_x];
			const coord2_y = cy - coords[other_y];
			const edge2_x = edges[other_x];
			const edge2_y = edges[other_y];
			const dot2 = coord2_x * edge2_x + coord2_y * edge2_y;
			const edge2_len_sq = edge2_x * edge2_x + edge2_y * edge2_y;
			const region2 = dot2 < 0 ? -1 : dot2 > edge2_len_sq ? 1 : 0;

			if ( region2 === -region ) {
				const target_x = left ? coord_x : coord2_x;
				const target_y = left ? coord_y : coord2_y;
				const len_sq = target_x * target_x + target_y * target_y;

				if ( len_sq > cr2 ) {
					result.collision = false;
					return false;
				}

				const len = Math.sqrt( len_sq );
				tmp_overlapping = true;
				tmp_overlap = cr - len;
				tmp_overlap_x = target_x / len;
				tmp_overlap_y = target_y / len;
				b_in_a = false;
			}
		}
		else {
			// circle center is in edge region — test normal distance
			const normal_x = norms[ix];
			const normal_y = norms[iy];
			const length = coord_x * normal_x + coord_y * normal_y;
			const abs_len = length < 0 ? -length : length;

			if ( length > 0 && abs_len > cr ) {
				result.collision = false;
				return false;
			}

			tmp_overlapping = true;
			tmp_overlap = cr - length;
			tmp_overlap_x = normal_x;
			tmp_overlap_y = normal_y;

			if ( b_in_a && ( length >= 0 || tmp_overlap < cr_dbl ) ) {
				b_in_a = false;
			}
		}

		if ( tmp_overlapping && ( overlap === null || overlap > tmp_overlap ) ) {
			overlap = tmp_overlap;
			overlap_x = tmp_overlap_x;
			overlap_y = tmp_overlap_y;
		}
	}

	// collision confirmed — write result
	// note: overlap direction is from polygon toward circle (push circle out)
	// The library convention when called as circle.collides(polygon) was reverse=true,
	// which negated overlap_x/y. Our callers expect: subtract overlap*overlap_x from circle pos.
	// So we negate here to match the old circle.collides(polygon) behavior.
	result.collision = true;
	result.overlap = overlap;
	result.overlap_x = -overlap_x;
	result.overlap_y = -overlap_y;
	return true;
}

// ── Circle vs Circle ─────────────────────────────────────────────
// Lightweight. Used for boid-food proximity scoring in Simulation.
export function testCircleCircle( ax, ay, ar, bx, by, br, result ) {
	const dx = bx - ax;
	const dy = by - ay;
	const rsum = ar + br;
	const dist_sq = dx * dx + dy * dy;
	if ( dist_sq > rsum * rsum ) {
		result.collision = false;
		return false;
	}
	const dist = Math.sqrt( dist_sq );
	result.collision = true;
	result.overlap = rsum - dist;
	if ( dist > 0 ) {
		result.overlap_x = dx / dist;
		result.overlap_y = dy / dist;
	}
	else {
		result.overlap_x = 0;
		result.overlap_y = 1;
	}
	return true;
}

// ── Polygon vs Polygon SAT ───────────────────────────────────────
// Init-only (SeparateRocks, light grid). Not hot-path optimized.
export function testPolygonPolygon( a, b, result ) {
	const a_coords = a.coords;
	const b_coords = b.coords;
	const a_normals = a.normals;
	const b_normals = b.normals;
	const a_count = a.vertex_count * 2;
	const b_count = b.vertex_count * 2;

	result.collision = false;
	result.overlap = 0;
	result.overlap_x = 0;
	result.overlap_y = 0;

	let overlap = null;
	let overlap_x = 0;
	let overlap_y = 0;
	let a_in_b = true;
	let b_in_a = true;

	// test a's normals
	for ( let ix = 0, iy = 1; ix < a_count; ix += 2, iy += 2 ) {
		if ( _separatingAxis( a_coords, a_count, b_coords, b_count, a_normals[ix], a_normals[iy] ) ) {
			return false;
		}
	}

	// test b's normals
	for ( let ix = 0, iy = 1; ix < b_count; ix += 2, iy += 2 ) {
		if ( _separatingAxis( a_coords, a_count, b_coords, b_count, b_normals[ix], b_normals[iy] ) ) {
			return false;
		}
	}

	// no separating axis found — polygons overlap.
	// compute overlap (minimum penetration vector)
	for ( let ix = 0, iy = 1; ix < a_count; ix += 2, iy += 2 ) {
		const ov = _axisOverlap( a_coords, a_count, b_coords, b_count, a_normals[ix], a_normals[iy] );
		if ( ov !== null && ( overlap === null || ( ov.mag < overlap || ( ov.mag === overlap && ov.sign ) ) ) ) {
			overlap = ov.mag;
			overlap_x = a_normals[ix] * ov.sign;
			overlap_y = a_normals[iy] * ov.sign;
		}
	}
	for ( let ix = 0, iy = 1; ix < b_count; ix += 2, iy += 2 ) {
		const ov = _axisOverlap( a_coords, a_count, b_coords, b_count, b_normals[ix], b_normals[iy] );
		if ( ov !== null && ( overlap === null || ( ov.mag < overlap || ( ov.mag === overlap && ov.sign ) ) ) ) {
			overlap = ov.mag;
			overlap_x = b_normals[ix] * ov.sign;
			overlap_y = b_normals[iy] * ov.sign;
		}
	}

	result.collision = true;
	result.overlap = overlap || 0;
	result.overlap_x = overlap_x;
	result.overlap_y = overlap_y;
	return true;
}

// ── Separating Axis Test (internal) ──────────────────────────────
function _separatingAxis( a_coords, a_count, b_coords, b_count, nx, ny ) {
	let a_min = 1e30, a_max = -1e30;
	let b_min = 1e30, b_max = -1e30;
	for ( let ix = 0, iy = 1; ix < a_count; ix += 2, iy += 2 ) {
		const d = a_coords[ix] * nx + a_coords[iy] * ny;
		if ( d < a_min ) { a_min = d; }
		if ( d > a_max ) { a_max = d; }
	}
	for ( let ix = 0, iy = 1; ix < b_count; ix += 2, iy += 2 ) {
		const d = b_coords[ix] * nx + b_coords[iy] * ny;
		if ( d < b_min ) { b_min = d; }
		if ( d > b_max ) { b_max = d; }
	}
	return a_min > b_max || a_max < b_min;
}

// ── Axis Overlap Computation (internal, for polygon-polygon result) ──
function _axisOverlap( a_coords, a_count, b_coords, b_count, nx, ny ) {
	let a_min = 1e30, a_max = -1e30;
	let b_min = 1e30, b_max = -1e30;
	for ( let ix = 0, iy = 1; ix < a_count; ix += 2, iy += 2 ) {
		const d = a_coords[ix] * nx + a_coords[iy] * ny;
		if ( d < a_min ) { a_min = d; }
		if ( d > a_max ) { a_max = d; }
	}
	for ( let ix = 0, iy = 1; ix < b_count; ix += 2, iy += 2 ) {
		const d = b_coords[ix] * nx + b_coords[iy] * ny;
		if ( d < b_min ) { b_min = d; }
		if ( d > b_max ) { b_max = d; }
	}
	if ( a_min > b_max || a_max < b_min ) { return null; }
	const o1 = a_max - b_min;
	const o2 = b_max - a_min;
	if ( o1 < o2 ) { return { mag: o1, sign: 1 }; }
	return { mag: o2, sign: -1 };
}

// ── Point in Polygon ─────────────────────────────────────────────
// Ray-casting (crossing number) algorithm. Works for convex and concave polygons.
// poly = polygon collider object
export function pointInPolygon( px, py, poly ) {
	const coords = poly.coords;
	const n2 = poly.vertex_count * 2;
	let inside = false;
	for ( let i = 0, j = n2 - 2; i < n2; j = i, i += 2 ) {
		const xi = coords[i], yi = coords[i + 1];
		const xj = coords[j], yj = coords[j + 1];
		if ( ( yi > py ) !== ( yj > py ) && px < ( xj - xi ) * ( py - yi ) / ( yj - yi ) + xi ) {
			inside = !inside;
		}
	}
	return inside;
}
