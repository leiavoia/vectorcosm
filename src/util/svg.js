	
import Two from "two.js";

export function UpdateBasicGeoProps( target, props ) {
	if ( 'x' in props ) { target.position.x = props.x; }
	if ( 'y' in props ) { target.position.y = props.y; }
	if ( 'a' in props ) { target.rotation = props.a; }
	if ( 's' in props ) { target.scale = props.s; }
	if ( 'opacity' in props ) { target.opacity = props.opacity; }
}
					
export function RehydrateGeoData( data ) {
	if ( !data ) { return null; }
	const type = data?.type || 'group';
	// create the basic geometry
	let geo = null;
	switch ( type ) {
		case 'circle': {
			let x = data?.x || 0;
			let y = data?.y || 0;
			let r = data?.r || data?.radius || 1;
			geo = globalThis.two.makeCircle( x, y, r );
			break;
		}
		case 'polygon': {
			let x = data?.x || 0;
			let y = data?.y || 0;
			let r = data?.r || data?.radius || 1;
			let n = data?.n || data?.p || 3;
			geo = globalThis.two.makePolygon( x, y, r, n );
			break;
		}
		case 'rect': {
			let x = data?.x || 0;
			let y = data?.y || 0;
			let w = data?.w || 1;
			let h = data?.h || 1;
			geo = globalThis.two.makeRectangle( x, y, w, h );
			break;
		}
		case 'path': {
			let pts = data?.pts || data?.points || data?.path || [];
			let anchors = pts.map( p => new Two.Anchor( p[0], p[1] ) );
			geo = globalThis.two.makePath(anchors);
			break;
		}
		case 'line': {
			let x1 = data?.x1 || 0;
			let y1 = data?.y1 || 0;
			let x2 = data?.x2 || 0;
			let y2 = data?.y2 || 0;
			geo = globalThis.two.makeLine( x1, y1, x2, y2 );
			break;
		}
		case 'group':
		default: {
			geo = globalThis.two.makeGroup();
			break;
		}
	}
	// general properties
	if ( 'x' in data ) { geo.position.x = data.x; }
	if ( 'y' in data ) { geo.position.y = data.y; }
	if ( type != 'group' ) {
		geo.fill = RehydrateColor( data?.fill || 'transparent' );
		geo.stroke = RehydrateColor( data?.stroke || 'transparent' );
		geo.linewidth = data?.linewidth || 2;
		if ( 'a' in data ) { geo.rotation = data.a; }
		else if ( 'rotation' in data ) { geo.rotation = data.rotation; }
		if ( 's' in data ) { geo.scale = data.s; }
		else if ( 'scale' in data ) { geo.scale = data.scale; }
		if ( 'o' in data ) { geo.opacity = data.opacity; }
		else if ( 'opacity' in data ) { geo.opacity = data.opacity; }
		if ( 'curved' in data ) { geo.curved = data.curved; }
		if ( 'dashes' in data ) { geo.dashes = data.dashes; }
		if ( 'cap' in data ) { geo.cap = data.cap; }
		if ( 'closed' in data ) { geo.closed = data.closed; }
		if ( 'miter' in data ) { geo.miter = data.miter; }
	}
	// children 
	if ( data?.children ) {
		for ( let child of data.children ) { 
			const c = RehydrateGeoData(child);
			if ( c ) { geo.add( c ); }
		}
	}
	return geo;
}

export function RehydrateColor( c ) {
	if ( !c ) { return null; }
	// anything stringy goes right back out
	if ( typeof c === 'string' ) { return c; }
	// gradients have special syntax
	if ( typeof c === 'object' ) {
		// NOTE: gradients in two.js are never deleted.
		// if we create gradients, we have to manually clean them up with RemoveUnusedGradients.
		let grad;
		let type = c?.type || 'linear';
		let stops = ( c?.stops || [1,'#FFF'] ).map( s => new Two.Stop(s[0], s[1]) );
		let xoff = c?.xoff || 0;
		let yoff = c?.yoff || 0;
		if ( type === 'radial' ) {
			let radius = c?.r || c?.radius || 1;
			grad = globalThis.two.makeRadialGradient(xoff, yoff, radius, ...stops );
		}
		else {
			let xoff2 = c?.xoff2 || 0;
			let yoff2 = c?.yoff2 || 0;
			grad = globalThis.two.makeLinearGradient(xoff, yoff, xoff2, yoff2, ...stops );
		}
		if ( c?.units==='user' || c?.units==='userSpaceOnUse' ) { grad.units = 'userSpaceOnUse'; }
		if ( 'spread' in c ) { grad.spread =c.spread; } // 'reflect', 'repeat', 'pad'
		return grad;			
	}
}

export function ExportSceneToSVG() {
	if (globalThis.two.renderer.domElement) {
		// extract the background gradient - this is quite tricky and dont currently have a solution.
		// const backgroundElement = document.querySelector('#vectorcosm_drawing_container');
		// const computedStyle = getComputedStyle(backgroundElement);
		// const backgroundGradient = computedStyle.background-image || 'black';
		const backgroundGradient = 'black';
		// assemble the SVG
		let str = `<svg version="1.1" width="${globalThis.two.width}" height="${globalThis.two.height}" xmlns="http://www.w3.org/2000/svg">`;
		str += `<defs><style><![CDATA[ .background { fill: ${backgroundGradient}; } ]]></style></defs>`;
		str += '<rect class="background" width="100%" height="100%"></rect>';
		str += globalThis.two.renderer.domElement.innerHTML;
		str += '</svg>';
		var blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
		// force download
		var fileURL = URL.createObjectURL(blob);
		const downloadLink = document.createElement('a');
		downloadLink.href = fileURL;
		downloadLink.download = 'vectorcosm.svg';
		document.body.appendChild(downloadLink);
		downloadLink.click();
		URL.revokeObjectURL(fileURL);
		downloadLink.remove();
	}
}

// count current number of svgs
export function CountSVGElements(node=null) {
	if ( !node ) { node = globalThis.two.scene; }
	let count = 1; // count this node
	if (node.children) {
		for (let child of node.children) {
			count += CountSVGElements(child);
		}
	}
	return count;
}

// Two.js does not delete gradient when they become orphaned. we have to do our own book keeping.
// SEE: https://github.com/jonobr1/two.js/issues/766
export function RemoveUnusedGradients(node=null) {
	if ( !node ) { node = globalThis.two.scene; }
	if ( node.stroke?._renderer?.type=='linear-gradient' || node.stroke?._renderer?.type=='radial-gradient' ) {
		globalThis.two.remove(node.stroke);
		if ( 'dispose' in node.stroke ) { node.stroke.dispose(); }
	}
	if ( node.fill?._renderer?.type=='linear-gradient' || node.fill?._renderer?.type=='radial-gradient' ) {
		globalThis.two.remove(node.fill);
		if ( 'dispose' in node.fill ) { node.fill.dispose(); }
	}
	if ( node?.children?.length ) {
		for ( let child of node.children ) {
			RemoveUnusedGradients(child);
		}
	}
}