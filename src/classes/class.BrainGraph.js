import * as utils from '../util/utils.js'

export default class BrainGraph {
	constructor(target, context) { 
		this.context = context;
		this.target = target;
		this.brain = target ? target.brain : null;
		this.draw_conns = true;
		this.draw_nodes = true;
		this.geo = this.context.makeGroup();
		this.conns_geo = null;
		this.nodes_geo = null;
		this.window_resize_cb = event => this.onScreenSizeChange();
		// window.vc.AddShapeToRenderLayer(this.geo,'ui'); // UI layer
		// window.addEventListener("resize", this.window_resize_cb );
	}
	Kill() {
		// window.removeEventListener("resize", this.window_resize_cb );
		this.geo.remove();
	}
	onScreenSizeChange() {
		if ( this.conns_geo ) { 
			this.conns_geo.remove();  
			this.conns_geo = null;
		}
		if ( this.nodes_geo ) { 
			this.nodes_geo.remove();  
			this.nodes_geo = null;
		}
	}
	setTarget(t) {
		if ( this.target != t ) { 
			this.target = t;
			this.brain = t.brain;
			this.onScreenSizeChange();
		}
	}
	Draw() {
		if ( !this.target || !this.brain ) { return; }
		// make sure the target hasn't changed
		if ( this.brain != this.target.brain ) {
			this.brain = this.target.brain;
			this.onScreenSizeChange();
		}
		let x = this.context.width / 2;
		let y = this.context.height / 2;
		let r = Math.min( this.context.width, this.context.height ) / 2.25;
		let a = (Math.PI * 2) /  this.brain.nodes.length;
		let node_r = 25;
		// update node positions in the ring
		for ( let i=0; i < this.brain.nodes.length; i++ ) {
			let node = this.brain.nodes[i];
			node.my_a = a * i;
			node.my_x = x + Math.cos(node.my_a) * r;
			node.my_y = y + Math.sin(node.my_a) * r;
		}
		// draw connections - connections do not fluctuate, so we can draw once and be done
		if ( this.draw_conns ) {
			// if ( this.conns_geo ) { 
			// 	this.conns_geo.remove(); 
			// 	this.conns_geo = null;
			// }
			if ( !this.conns_geo ) { 
				this.conns_geo = this.context.makeGroup(); 
				this.geo.add(this.conns_geo);
				// this.conns_geo = two.makeGroup();
				// draw direct connections as lines
				for ( let c of this.brain.connections ) {
					let line = this.context.makeLine(c.from.my_x, c.from.my_y, c.to.my_x, c.to.my_y);
					let v = Math.trunc( Math.abs( utils.clamp(c.weight,-10,10) ) * 256 ); // scales 0..0.1 to 0..256
					v = utils.clamp(v,64,255); // minimum color for visibility
					line.stroke = (c.weight > 0 ? '#FFFFFF' : '#DD1111') + utils.DecToHex(v);
					line.linewidth = 1;
					if ( c.gater ) { line.dashes = [12,8]; }
					this.conns_geo.add(line);
				}
				// draw self connections as extra rings
				for ( let c of this.brain.selfconns ) {
					// self connection draws a circle
					let ring_r = utils.clamp(c.from.bias*2,-3,3) + 2;
					let line = this.context.makeCircle(c.from.my_x, c.from.my_y, ring_r);
					let v = Math.trunc( Math.abs( utils.clamp(c.weight,-10,10) ) * 256 ); // scales 0..0.1 to 0..256
					v = utils.clamp(v,64,255); // minimum color for visibility
					line.stroke = (c.weight > 0 ? '#FFFFFF' : '#DD1111') + utils.DecToHex(v);
					line.linewidth = 1;
					line.fill = 'transparent';
					if ( c.gater ) { line.dashes = [12,8]; }
					this.conns_geo.add(line);
				}
			}
		}
		// draw output nodes and labels
		if ( this.draw_nodes ) {
			if ( this.nodes_geo ) { 
				this.nodes_geo.remove(); 
				this.nodes_geo = null;
			}
			this.nodes_geo = this.context.makeGroup();
			this.geo.add(this.nodes_geo);
			let output_i = 0;
			let input_i = 0;
			const input_labels = this.target.sensor_outputs.map(s=>s.name);
			for ( let i=0; i < this.brain.nodes.length; i++ ) {
				let node = this.brain.nodes[i];
				let activation_label = node.activation.toFixed(2);
				let rect = null;
				if ( node.type == 'input' ) {
					rect = this.context.makePolygon(node.my_x, node.my_y, node_r, 3);
					let text = this.context.makeText( input_labels[input_i++] + ' ' + activation_label, node.my_x, node.my_y, { fill: '#FFF' } );
					text.position.y -= node_r + 8;
					this.nodes_geo.add(text);
				}
				else if ( node.type == 'output' ) {
					rect = this.context.makePolygon(node.my_x, node.my_y, node_r, 4);
					let text = this.context.makeText( this.target.motors[output_i++].name + ' / ' + node.squash.name + ' ' + activation_label, node.my_x, node.my_y, { fill: '#FFF' } );
					text.position.y -= node_r + 8;
					this.nodes_geo.add(text);
				}
				else {
					node_r += utils.clamp(node.bias*2,-3,3);
					rect = this.context.makeCircle(node.my_x, node.my_y, node_r);
					let text = this.context.makeText( node.squash.name + ' ' + activation_label, node.my_x, node.my_y, { fill: '#FFF' } );
					text.position.y -= node_r + 8;
					this.nodes_geo.add(text);
				}
				let hexval = utils.DecToHex( Math.round(Math.abs(utils.clamp(node.activation,-1,1)) * 255) );
				rect.fill = node.activation >= 0 
					? ('#00' + hexval + '00') 
					: ('#' + hexval + '0000') ;
				rect.linewidth = 1;
				rect.stroke = '#FFF';
				this.nodes_geo.add(rect);
			}
			this.geo.add(this.nodes_geo);
		}
	}
}