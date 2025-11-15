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
		// sniff for architecture hints: SNN
		if ( 'inputs' in brain ) {
			let center_x = context.width / 2;
			let center_y = context.height / 2;
			let max_r = Math.min( context.width, context.height ) / 2.25;
			let node_r = 18;
			let cell_angle = (Math.PI * 2) /  brain.nodes.length;
			
			// precalc positions of all nodes
			if ( !( 'my_a' in brain.nodes[0] ) ) {
				// ring shape
				for ( let i=0; i < brain.nodes.length; i++ ) {
					let node = brain.nodes[i];
					node.my_a = cell_angle * i;
					node.my_a1 = cell_angle * i - ( 0.5 * cell_angle );
					node.my_a2 = cell_angle * i + ( 0.5 * cell_angle );
					node.my_cx  = center_x + Math.cos(node.my_a)  * ( max_r - node_r * 0.25 ); // inner dent
					node.my_cy  = center_y + Math.sin(node.my_a)  * ( max_r - node_r * 0.25 );
					node.my_ox  = center_x + Math.cos(node.my_a)  * ( max_r + node_r * 1.75 ); // outer dent
					node.my_oy  = center_y + Math.sin(node.my_a)  * ( max_r + node_r * 1.75 );
					node.my_x  = center_x + Math.cos(node.my_a)  * ( max_r - node_r ); // bottom center
					node.my_y  = center_y + Math.sin(node.my_a)  * ( max_r - node_r );
					node.my_x1 = center_x + Math.cos(node.my_a1) * ( max_r + node_r ); // top left
					node.my_y1 = center_y + Math.sin(node.my_a1) * ( max_r + node_r );
					node.my_x2 = center_x + Math.cos(node.my_a2) * ( max_r + node_r ); // top right
					node.my_y2 = center_y + Math.sin(node.my_a2) * ( max_r + node_r );
					node.my_x3 = center_x + Math.cos(node.my_a2) * ( max_r - node_r ); // bottom right
					node.my_y3 = center_y + Math.sin(node.my_a2) * ( max_r - node_r );
					node.my_x4 = center_x + Math.cos(node.my_a1) * ( max_r - node_r ); // bottom left
					node.my_y4 = center_y + Math.sin(node.my_a1) * ( max_r - node_r );
				}
			}
			
			// draw connections - connections do not fluctuate, so we can draw once and be done
			if ( draw_conns ) {
				if ( !conns_geo ) { 
					conns_geo = context.makeGroup(); 
					geo.add(conns_geo);
					// draw connections as lines
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						for ( let c=0; c < node.c.length; c+=2 ) {
							let w = node.c[c+1];
							let index_to = node.c[c];
							let from = node;
							let to = brain.nodes[index_to];
							// make an arcing path using the start, finish, and offset center point
							let mid_x = (from.my_x + to.my_x) / 2;
							let mid_y = (from.my_y + to.my_y) / 2;
							mid_x = (mid_x * 8 + center_x * 2) / 10;
							mid_y = (mid_y * 8 + center_y * 2) / 10;
							// if the midpoint is too close to the center of the screen push it out radially
							const dist_to_center = Math.sqrt( (mid_x - center_x)**2 + (mid_y - center_y)**2 );
							const push = 0.35;
							if ( dist_to_center < max_r * push ) {
								const angle_to_center = Math.atan2( mid_y - center_y, mid_x - center_x );
								mid_x = center_x + Math.cos(angle_to_center) * max_r * push;
								mid_y = center_y + Math.sin(angle_to_center) * max_r * push;
							}
							// create the curved line
							let line = context.makePath([
								new Two.Anchor( from.my_x, from.my_y ),
								new Two.Anchor( mid_x, mid_y ),
								new Two.Anchor( to.my_x, to.my_y ),
							]);
							line.curved = true;
							line.closed = false;
							// color indicates weight sign
							const hue = w >= 0 ? 120 : 0; // green/red
							line.stroke = `hsl(${hue}, 100%, 50%)`;
							// width indicates connection weight
							line.linewidth = Math.abs( utils.clamp(w,-1,1) ) * 2 + 1;
							line.fill = 'transparent';
							line.opacity = Math.abs(w) * 0.4 + 0.1;
							conns_geo.add(line);
						}
					}
				}
				// update connection colors according to the activation of the from-node
				else {
					let conn_index = 0;
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						for ( let j=0; j < node.c.length; j+=2 ) { // note paired data: index, weight, index, weight, ...	
							let c = node.c[j];
							let w = node.c[j+1];
							let activation = boid?.brain[i]?.value ?? node?.v ?? 0; // magic
							activation = utils.Clamp(activation,-1,1);
							let line = conns_geo.children[conn_index++]; // get the next line in the group
							// opacity indicates activation
							let opacity = Math.abs( utils.clamp(activation,-1,1) ) * 0.4 + 0.1;
							if ( line.opacity != opacity ) { line.opacity = opacity; }
							// update connection weight in case it changed from adaptive learning
							const hue = w >= 0 ? 120 : 0; // green/red
							const stroke = `hsl(${hue}, 100%, 50%)`;
							if ( line.stroke != stroke ) { line.stroke = line.stroke; }
							const linewidth = Math.abs( utils.clamp(w,-1,1) ) * 6 + 1;
							if ( line.linewidth != linewidth ) { line.linewidth = line.linewidth; }
						}
					}		
				}				
			}		
						
			// draw nodes
			if ( draw_nodes ) {
				// create the nodes
				if ( !nodes_geo ) { 
					nodes_geo = context.makeGroup();
					geo.add(nodes_geo);
				}
				// only create new geometry on the first run
				if ( !neuron_geos.length ) {
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						let is_input = brain.inputs.contains(i);
						let is_output = false;
						for ( let o of brain.outputs ) {
							if ( o.n.contains(i) ) { // /!\ watch out for abbreviations
								is_output = true;
								break;
							}
						}
						let anchors = [
							new Two.Anchor( node.my_x1, node.my_y1 ) // TL
						]
						if ( is_output ) {
							anchors.push( new Two.Anchor( node.my_ox, node.my_oy ) ); // outdent
						}
						anchors.push( new Two.Anchor( node.my_x2, node.my_y2 ) ) // TR
						anchors.push( new Two.Anchor( node.my_x3, node.my_y3 ) ) // BR
						if ( is_input ) {
							anchors.push( new Two.Anchor( node.my_cx, node.my_cy ) ); // center
						}
						anchors.push( new Two.Anchor( node.my_x4, node.my_y4 ) ) // BL
						let rect = globalThis.two.makePath(anchors);
						rect.fill = '#000';
						rect.linewidth = 0;
						rect.stroke = '#AAAAAA88';
						nodes_geo.add(rect);
						neuron_geos.push(rect);
					}
				}
				// otherwise we can just update what we already have 
				else {
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						let v = boid?.brain[i]?.value ?? node?.v ?? 0; // magic
						v = utils.Clamp(v,-1,1);
						let rect = neuron_geos[i];
						// fill
						if ( boid?.brain[i]?.fired ) {
							rect.fill = '#FFFFFF';
							rect.opacity = 1.0;
						}
						else if ( v < 0 ) {
							rect.fill = '#' + Math.trunc(Math.min(255,(-v * 256))).toString(16).padStart(2,'0') + '0000';
							rect.opacity = Math.abs(v);
						}
						else {
							rect.fill = '#00' + Math.trunc(Math.min(255,(v * 256))).toString(16).padStart(2,'0') + '00';
							rect.opacity = Math.abs(v);
						}					
					}
				}
			}			
		}
		// EPANN
		else if ( 'max_logs' in brain ) {
			let x = context.width / 2;
			let y = context.height / 2;
			let r = Math.min( context.width, context.height ) / 2.25;
			let a = (Math.PI * 2) /  brain.nodes.length;
			let node_r = 25;
			// update node positions in the ring - only do this once
			if ( !( 'my_a' in brain.nodes[0] ) ) {
				// ring shape
				for ( let i=0; i < brain.nodes.length; i++ ) {
					let node = brain.nodes[i];
					node.my_a = a * i;
					node.my_x = x + Math.cos(node.my_a) * r;
					node.my_y = y + Math.sin(node.my_a) * r;
				}
			}
			// draw connections - connections do not fluctuate, so we can draw once and be done
			if ( draw_conns ) {
				if ( !conns_geo ) { 
					conns_geo = context.makeGroup(); 
					geo.add(conns_geo);
					// draw direct connections as lines
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						for ( let j=0; j < node.c.length; j+=2 ) { // note paired data: index, weight, index, weight, ...
							let c = node.c[j];
							let w = node.c[j+1];
							let from = node;
							let to = brain.nodes[c];
							// make an arcing path using the start, finish, and offset center point
							let mid_x = (from.my_x + to.my_x) / 2;
							let mid_y = (from.my_y + to.my_y) / 2;
							mid_x = (mid_x * 8 + x * 2) / 10;
							mid_y = (mid_y * 8 + y * 2) / 10;
							// if the midpoint is too close to the center of the screen push it out radially
							const dist_to_center = Math.sqrt( (mid_x - x)**2 + (mid_y - y)**2 );
							if ( dist_to_center < r * 0.35 ) {
								const angle_to_center = Math.atan2( mid_y - y, mid_x - x );
								mid_x = x + Math.cos(angle_to_center) * r * 0.35;
								mid_y = y + Math.sin(angle_to_center) * r * 0.35;
							}
							// create the curved line
							let line = context.makePath([
								new Two.Anchor( from.my_x, from.my_y ),
								new Two.Anchor( mid_x, mid_y ),
								new Two.Anchor( to.my_x, to.my_y ),
							]);
							line.curved = true;
							line.closed = false;
							// color indicates weight sign
							const hue = w >= 0 ? 120 : 0; // green/red
							line.stroke = `hsl(${hue}, 100%, 50%)`;
							// width indicates connection weight
							line.linewidth = Math.abs( utils.clamp(w,-1,1) ) * 6 + 1;
							line.fill = 'transparent';
							conns_geo.add(line);
						}
					}
				}
				// update connection colors according to the activation of the from-node
				else {
					let conn_index = 0;
					for ( let i=0; i < brain.nodes.length; i++ ) {
						let node = brain.nodes[i];
						for ( let j=0; j < node.c.length; j+=2 ) { // note paired data: index, weight, index, weight, ...	
							let c = node.c[j];
							let w = node.c[j+1];
							let activation = node?.v ?? boid?.brain[i]?.value ?? 0;
							let line = conns_geo.children[conn_index++]; // get the next line in the group
							// opacity indicates activation
							let opacity = Math.abs( utils.clamp(activation,-1,1) ) * 0.5 + 0.2;
							if ( line.opacity != opacity ) { line.opacity = opacity; }
							// update connection weight in case it changed from adaptive learning
							const hue = w >= 0 ? 120 : 0; // green/red
							const stroke = `hsl(${hue}, 100%, 50%)`;
							if ( line.stroke != stroke ) { line.stroke = line.stroke; }
							const linewidth = Math.abs( utils.clamp(w,-1,1) ) * 6 + 1;
							if ( line.linewidth != linewidth ) { line.linewidth = line.linewidth; }
						}
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
					let activation = node?.v ?? boid?.brain[i]?.value ?? 0;
					let activation_label = activation.toFixed(2);
					// create the label strings
					const is_input = i < brain.num_inputs;
					const is_output = i >= (brain.nodes.length - brain.num_outputs);
					let label = '';
					if ( is_input ) {
						label = boid.sensors[input_i++].name + ' ' + activation_label
					}
					else if ( is_output ) {
						label = boid.motors[output_i++].name + ' ' + activation_label
					}
					else {
						label = node.s + ' ' + activation_label;
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
						if ( is_input ) {
							rect = context.makePolygon(node.my_x, node.my_y, node_r, 3);
						}
						else if ( is_output ) {
							rect = context.makePolygon(node.my_x, node.my_y, node_r, 4);
						}
						else {
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
		}
		context.update();
	}

</script>

<!-- <section>
	<div id="braingraph_context"></div>
</section> -->