
export function nextHalfedge(e) { return (e % 3 === 2) ? e - 2 : e + 1; }
export function edgesOfTriangle(t) { return [3 * t, 3 * t + 1, 3 * t + 2]; }
export function triangleOfEdge(e)  { return Math.floor(e / 3); }

export function pointsOfTriangle(delaunay, t) {
    return edgesOfTriangle(t)
        .map(e => delaunay.triangles[e]);
}

export function forEachTriangle(points, delaunay, callback) {
    for (let t = 0; t < delaunay.triangles.length / 3; t++) {
        callback(t, pointsOfTriangle(delaunay, t).map(p => points[p]));
    }
}

export function circumcenter(a, b, c) {
    const ad = a[0] * a[0] + a[1] * a[1];
    const bd = b[0] * b[0] + b[1] * b[1];
    const cd = c[0] * c[0] + c[1] * c[1];
    const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    return [
        1 / D * (ad * (b[1] - c[1]) + bd * (c[1] - a[1]) + cd * (a[1] - b[1])),
        1 / D * (ad * (c[0] - b[0]) + bd * (a[0] - c[0]) + cd * (b[0] - a[0])),
    ];
}

export function triangleCenter(points, delaunay, t) {
    const vertices = pointsOfTriangle(delaunay, t).map(p => points[p]);
    return circumcenter(vertices[0], vertices[1], vertices[2]);
}

export function edgesAroundPoint(delaunay, start) {
    const result = [];
    let incoming = start;
    do {
        result.push(incoming);
        const outgoing = nextHalfedge(incoming);
        incoming = delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start);
    return result;
}

export function forEachVoronoiCell(points, delaunay, callback) {
    const index = new Map(); // point id to half-edge id
    for (let e = 0; e < delaunay.triangles.length; e++) {
        const endpoint = delaunay.triangles[nextHalfedge(e)];
        if (!index.has(endpoint) || delaunay.halfedges[e] === -1) {
            index.set(endpoint, e);
        }
    }
    for (let p = 0; p < points.length; p++) {
        const incoming = index.get(p);
        const edges = edgesAroundPoint(delaunay, incoming);
        const triangles = edges.map(triangleOfEdge);
        const vertices = triangles.map(t => triangleCenter(points, delaunay, t));
        callback(vertices, points[p][0], points[p][1]);
    }
}

export function trimPolygon(vertices, x1, y1, x2, y2) {
	// Helper function to determine which side of the line a point lies on
	function isPointInside(px, py) {
		return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1) >= 0;
	}

	// Helper function to compute intersection point of a line segment with the clipping line
	function computeIntersection(x3, y3, x4, y4) {
		const A1 = y2 - y1;
		const B1 = x1 - x2;
		const C1 = A1 * x1 + B1 * y1;

		const A2 = y4 - y3;
		const B2 = x3 - x4;
		const C2 = A2 * x3 + B2 * y3;

		const det = A1 * B2 - A2 * B1;

		if (Math.abs(det) < 1e-10) return null; // Parallel lines
		const ix = (B2 * C1 - B1 * C2) / det;
		const iy = (A1 * C2 - A2 * C1) / det;
		return [ ix, iy ];
	}

	const newVertices = [];
	const n = vertices.length;

	for (let i = 0; i < n; i++) {
		const [ xA, yA ] = vertices[ i ];
		const [ xB, yB ] = vertices[ (i + 1) % n ];

		const insideA = isPointInside(xA, yA);
		const insideB = isPointInside(xB, yB);

		// Both vertices are inside, add endpoint B
		if (insideA && insideB) {
			newVertices.push([ xB, yB ]);
		} 
		// A is inside, B is outside, add intersection
		else if (insideA && !insideB) {
			const intersection = computeIntersection(xA, yA, xB, yB);
			if (intersection) newVertices.push(intersection);
		} 
		// A is outside, B is inside, add intersection and endpoint B
		else if (!insideA && insideB) {
			const intersection = computeIntersection(xA, yA, xB, yB);
			if (intersection) newVertices.push(intersection);
			newVertices.push([ xB, yB ]);
		}
		// If both are outside, do nothing
	}

	return newVertices;
}