<script>
	import Two from "two.js";
	import { onMount, getContext, onDestroy } from 'svelte';
	// import { fade } from 'svelte/transition';
	import * as utils from '../util/utils.js'
	
	let renderObjects = getContext('renderObjects');
	
	let { boid } = $props();
	
	let context = null;
	let geo = null;
	let brain = null;
	let draw_conns = true;
	let draw_nodes = true;
	let conns_geo = null;
	let nodes_geo = null;
	let neuron_geos = [];
	let neuron_labels = [];
	let mounted = false;
	let last_oid = 0;
	
	//
	// NOTE: this is currently hardwired to push objects onto the main Two.js context,
	// but the foundation to render it into its own context/widget is commented out below.
	//
	
	onMount(() => {
		// set up Two.js
		// context = new Two({ fitted: true, type: 'SVGRenderer' });  // 'WebGLRenderer', 'SVGRenderer', 'CanvasRenderer'
		// let elem = globalThis.document.getElementById('braingraph_context');
		// context.appendTo(elem);
		context = globalThis.two;
		mounted = true;
	})
	
	onDestroy( () => {
		// window.removeEventListener("resize", window_resize_cb );
		if ( geo ) { geo.remove(); }
		// context.clear();
		mounted = false;
	} );
	
	
	$effect( () => {
		if ( !boid ) { brain = null; return; }
		if ( boid ) {
			// overwrite data if switched targets
			if ( !brain || boid.oid != last_oid ) {
				// we stashed this data on the first call to pickObject
				brain = renderObjects.get(boid.oid).geodata.brain_struct;
			}
			if ( brain ) { Draw(); }
		}
	});
	
	function Draw() {
		if ( !mounted || !boid || !brain ) { return; }
		// reset everything if boid has changed
		if ( last_oid != boid.oid ) {
			last_oid = boid.oid;
			if ( geo ) { geo.remove(); }
			conns_geo = null;
			nodes_geo = null;
			neuron_geos = [];
			neuron_labels = [];
			geo = context.makeGroup();
		}
		let x = context.width / 2;
		let y = context.height / 2;
		let r = Math.min( context.width, context.height ) / 2.25;
		let a = (Math.PI * 2) /  brain.nodes.length;
		let node_r = 25;
		// update node positions in the ring
		for ( let i=0; i < brain.nodes.length; i++ ) {
			let node = brain.nodes[i];
			node.my_a = a * i;
			node.my_x = x + Math.cos(node.my_a) * r;
			node.my_y = y + Math.sin(node.my_a) * r;
		}
		// draw connections - connections do not fluctuate, so we can draw once and be done
		if ( draw_conns ) {
			if ( !conns_geo ) { 
				conns_geo = context.makeGroup(); 
				geo.add(conns_geo);
				// draw direct connections as lines
				for ( let c of brain.connections ) {
					let from = brain.nodes[c.from];
					let to = brain.nodes[c.to];
					let line = context.makeLine(from.my_x, from.my_y, to.my_x, to.my_y);
					let v = Math.trunc( Math.abs( utils.clamp(c.weight,-10,10) ) * 256 ); // scales 0..0.1 to 0..256
					v = utils.clamp(v,64,255); // minimum color for visibility
					line.stroke = (c.weight > 0 ? '#FFFFFF' : '#DD1111') + utils.DecToHex(v);
					line.linewidth = 1;
					if ( c.gater ) { line.dashes = [12,8]; }
					conns_geo.add(line);
				}
				// draw self connections as extra rings
				if ( brain?.selfconns ) {
					for ( let c of brain.selfconns ) {
						// self connection draws a circle
						let ring_r = utils.clamp(c.from.bias*2,-3,3) + 2;
						let line = context.makeCircle(c.from.my_x, c.from.my_y, ring_r);
						let v = Math.trunc( Math.abs( utils.clamp(c.weight,-10,10) ) * 256 ); // scales 0..0.1 to 0..256
						v = utils.clamp(v,64,255); // minimum color for visibility
						line.stroke = (c.weight > 0 ? '#FFFFFF' : '#DD1111') + utils.DecToHex(v);
						line.linewidth = 1;
						line.fill = 'transparent';
						if ( c.gater ) { line.dashes = [12,8]; }
						conns_geo.add(line);
					}
				}
			}
			// update connection colors according to the activation of the from-node
			else {
				for ( let i=0; i < brain.connections.length; i++ ) {
					let c = brain.connections[i];
					let activation = brain.nodes[c.from]?.activation ?? boid?.brain[c.from]?.value ?? 0;
					let line = conns_geo.children[i];
					let w = Math.max( 1, Math.trunc( Math.abs( utils.clamp(activation,-1,1) ) * 40 ) / 10 );
					if ( line.linewidth != w ) { line.linewidth = w; }
					let opacity = Math.max( 0.4, Math.abs( utils.clamp(activation,-1,1) ) );
					// blend the activation and the weight together for general concept of "importance"
					let v = Math.tanh( Math.abs( utils.clamp(c.weight,-10,10) ) );
					opacity = ( opacity + v ) / 2;
					if ( line.opacity != opacity ) { line.opacity = opacity; }
				}
			}
		}
		// draw output nodes and labels
		if ( draw_nodes ) {
			if ( !nodes_geo ) { 
				nodes_geo = context.makeGroup();
				geo.add(nodes_geo);
			}
			let output_i = 0;
			let input_i = 0;
			for ( let i=0; i < brain.nodes.length; i++ ) {
				let node = brain.nodes[i];
				let activation = node?.activation ?? boid?.brain[i]?.value ?? 0;
				let activation_label = activation.toFixed(2);
				// create the label strings
				let label = '';
				if ( node.type == 'input' ) {
					label = boid.sensors[input_i++].name + ' ' + activation_label
				}
				else if ( node.type == 'output' ) {
					label = boid.motors[output_i++].name + ' ' + activation_label
				}
				else {
					label = node.squash + ' ' + activation_label;
				}
				// color the shapes
				let hexval = utils.DecToHex( Math.round(Math.abs(utils.clamp(activation,-1,1)) * 255) );
				// only create new geometry on the first run
				if ( i >= neuron_geos.length ) { 
					// create text elements
					let text = context.makeText( label, node.my_x, node.my_y, { fill: '#FFF' } );
					text.position.y -= node_r + 8;
					nodes_geo.add(text);
					neuron_labels.push(text);
					// create the shapes
					let rect = null;
					if ( node.type == 'input' ) {
						rect = context.makePolygon(node.my_x, node.my_y, node_r, 3);
					}
					else if ( node.type == 'output' ) {
						rect = context.makePolygon(node.my_x, node.my_y, node_r, 4);
					}
					else {
						node_r += utils.clamp(node.bias*2,-3,3);
						rect = context.makeCircle(node.my_x, node.my_y, node_r);
					}
					rect.fill = '#000';
					rect.linewidth = 1;
					rect.stroke = '#FFF';
					nodes_geo.add(rect);
					neuron_geos.push(rect);
				}
				// otherwise we can just update what we already have 
				else {
					let rect = neuron_geos[i];
					let text = neuron_labels[i] ?? {};
					text.value = label;
					rect.fill = activation >= 0 
						? ('#00' + hexval + '00') 
						: ('#' + hexval + '0000') ;
				}
			}
		}
		context.update();
	}

</script>

<!-- <section>
	<div id="braingraph_context"></div>
</section> -->