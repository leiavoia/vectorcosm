import * as utils from '../util/utils.js'
import * as TWEEN from '@tweenjs/tween.js'
import * as SVGUtils from '../util/svg.js'
import Two from "two.js";

export default class Camera {

	constructor( renderLayers, renderObjects ) {
		this.renderLayers = renderLayers;
		this.renderObjects = renderObjects; // gives camera access to game objects for cinema and interactivity
		this.x = 0;
		this.y = 0;
		this.z = 1;
		this.xmin = 0; // box used to determine if stuff is in view
		this.ymin = 0;
		this.xmax = 0;
		this.ymax = 0;
		this.min_zoom = 0.1;
		this.max_zoom = 2.4;
		this.window_width = 640;
		this.window_height = 480;
		this.tank_width = 100;
		this.tank_height = 100;
		this.focus_object = null;
		this.focus_geo = null;
		this.allow_hyperzoom = true;
		this.scale = 1;
		this.easing = TWEEN.Easing.Sinusoidal.InOut; // SEE: https://github.com/tweenjs/tween.js/blob/main/docs/user_guide.md
		this.transitions = true;
		this.parallax = false;
		this.transition_time = 3000; // ms
		this.focus_time = 8000; // ms
		this.show_boid_indicator_on_focus = true;
		this.show_boid_sensors_on_focus = true;
		this.show_boid_info_on_focus = true;
		this.center_camera_on_focus = true;
		this.animate_boids = true;
		this.dramatic_entrance = false; // might merge this with `transitions`
		this.animation_min = 0.4 // zoom level beyond which we stop animating
		this.background_attachment = 'screen'; // 'screen' or 'tank'
		// innards:
		this.focus_geo = null;
		this.focus_overlay_geo = null;
		this.focus_obj_id = 0;
		this.cinema_mode = false;
		this.cinema_timeout = null;
		this.tween = null;
	}

	Hilite( x, y, a=0 ) {
		if ( !this.show_boid_indicator_on_focus ) {
			this.HiliteOff();
			return;
		}
		// create the focus ring if it doesnt already exist
		if ( !this.focus_geo ) {
			this.focus_geo = globalThis.two.makeGroup();
			let circle = globalThis.two.makeCircle( 0, 0, 120 );
			circle.fill = 'transparent';
			circle.stroke = '#9D9';
			circle.linewidth = 6;
			this.focus_geo.add(circle);
			// uncomment this if you want a little indicator triangle
			// let triangle = globalThis.two.makePath([
			// 	new Two.Anchor( 130, 0 ),
			// 	new Two.Anchor( 120, -15 ),
			// 	new Two.Anchor( 120, 15 ),
			// ]);
			// triangle.stroke = 'transparent';
			// triangle.fill = '#AEA';
			// triangle.linewidth = 0;
			// this.focus_geo.add(triangle);
			// this.focus_geo.opacity = 0.68;
			this.renderLayers['ui'].add(this.focus_geo);
		}	
		// turn on update position
		if ( !this.focus_geo.visible ) { this.focus_geo.visible = true; }
		this.focus_geo.position.x = x;
		this.focus_geo.position.y = y;
		// uncomment to rotate indicator triangle
		// this.focus_geo.rotation = a;		
	}
	
	HiliteOff() {
		// turn the focus ring off
		if ( this.focus_geo && this.focus_geo.visible ) {
			this.focus_geo.visible = false;
		}
	}

	// TECHNICAL: we have to split TrackObject and Update into separate functions to avoid
	// jank from stale data access at the wrong time in API callbacks. Instead, put any
	// camera movement here and call this function just before rendering the scene. 
	Render() {
		if ( !globalThis.two ) { return; }
		
		// tweening - mostly for camera movement
		TWEEN.update();	
					
		// keep focus if we are tracking on object
		if ( this.focus_obj_id ) {
			const obj = this.renderObjects.get(this.focus_obj_id);
			if ( obj ) {
				// snap camera to center on object
				if ( this.center_camera_on_focus ) {
					this.PointCameraAt( obj.x, obj.y ); 
				}
				
				// turn the focus ring on and move into position
				this.Hilite( obj.x, obj.y, obj.a );
				
				// render data overlay like sensors
				if ( this.show_boid_sensors_on_focus ) {
					// create if doesnt exist
					if ( obj?.geodata?.sensors && !this.focus_overlay_geo ) {
						this.focus_overlay_geo = SVGUtils.RehydrateGeoData(obj.geodata.sensors);
						this.renderLayers['ui'].add(this.focus_overlay_geo);
					}		
					// update overlays
					if ( this.focus_overlay_geo ) {
						this.focus_overlay_geo.position.x = obj.x;
						this.focus_overlay_geo.position.y = obj.y;
						this.focus_overlay_geo.rotation = obj.a;
						this.focus_overlay_geo.visible = true;
					}			
				}
				else if ( this.focus_overlay_geo ) {
					this.focus_overlay_geo.visible = false;
				}
			}
		}
		
		// final scene render
		globalThis.two.update(); 
	}	
		
	TrackObject( oid ) {
		// stop tracking
		if ( !oid ) { 
			// turn the focus ring off
			this.HiliteOff();
			// remove overlays
			if ( this.focus_overlay_geo ) {
				this.focus_overlay_geo.remove();
				this.focus_overlay_geo = null;
			}
			// stop tacking
			this.focus_obj_id = 0;
			return; 
		}
		// remove target-specific elements
		if ( this.focus_overlay_geo && oid && oid != this.focus_obj_id ) {
			this.focus_overlay_geo.remove();
			this.focus_overlay_geo = null;
		}		
		// start tracking
		const obj = this.renderObjects.get(oid);
		if ( !obj ) { return this.TrackObject(false); } // object has died - stop tracking
		this.focus_obj_id = oid;
	}
	
	ScreenToWorldCoord( x, y ) {
		x = ( x - this.renderLayers['tank'].position.x ) / this.scale;
		y = ( y - this.renderLayers['tank'].position.y ) / this.scale;
		return [x,y];
	}	

	// put camera at a specific point in world space / zoom
	// if center is true, camera will force center position when zoom is wider than tank
	PointCameraAt( x, y, z=null, center=false ) {
		
		center = center || !this.allow_hyperzoom;
		 
		// entire tank is smaller than screen - snap to center
		if ( center && z && z * this.tank_width <= this.window_width && z * this.tank_height <= this.window_height ) { 
			const scalex = this.window_width / this.tank_width;
			const scaley = this.window_height / this.tank_height;
			const scale = Math.min(scalex,scaley); // min = contain, max = cover
			x = this.tank_width * 0.5;
			y = this.tank_height * 0.5;
			if ( center ) { z = scale; }
			}
		
		// zoom
		if ( z && z!=this.scale ) { 
			z = Math.min( z, this.max_zoom );
			this.SetViewScale( z ); 
		}
		
		// X pos	
		const target_x = -( x * this.scale ) + ( 0.5 * this.window_width );
		const max_x = -0.0001 + (this.tank_width * this.scale) - (this.window_width);
		if ( this.scale * this.tank_width <= this.window_width && center ) { this.renderLayers['tank'].position.x = -max_x / 2; }
		else if ( target_x > 0 && center ) { this.renderLayers['tank'].position.x = 0; }  
		else if ( target_x < -max_x && center ) { this.renderLayers['tank'].position.x = -max_x; }  
		else { this.renderLayers['tank'].position.x = target_x; }
		
		// Y pos
		const target_y = -( y * this.scale ) + ( 0.5 * this.window_height );
		const max_y = -0.0001 + (this.tank_height * this.scale) - (this.window_height);
		if ( this.scale * this.tank_height <= this.window_height && center ) { this.renderLayers['tank'].position.y = -max_y / 2; }
		else if ( target_y > 0 && center ) { this.renderLayers['tank'].position.y = 0; }  
		else if ( target_y < -max_y && center ) { this.renderLayers['tank'].position.y = -max_y; }
		else { this.renderLayers['tank'].position.y = target_y; }
		
		// record stats
		[ this.x, this.y ] = this.ScreenToWorldCoord( this.window_width * 0.5, this.window_height * 0.5 );
		[ this.xmin, this.ymin ] = this.ScreenToWorldCoord( 0, 0 );
		[ this.xmax, this.ymax ] = this.ScreenToWorldCoord( this.window_width, this.window_height );
		this.z = this.scale;	
		
		this.AdjustBackgroundForParallax();
	}
	
	ResetCameraZoom() {
		const scalex = this.window_width / this.tank_width;
		const scaley = this.window_height / this.tank_height;
		const scale = Math.min(scalex,scaley); // min = contain, max = cover
		this.min_zoom = scale;
		// this.max_zoom = 2; // Math.min(this.tank_width,this.tank_height) / 1250;
		this.PointCameraAt( this.tank_width*0.5, this.tank_height*0.5, scale, true ); // force centering	
	}
	
	SetViewScale( scale ) {
		const prev_scale = this.renderLayers['tank'].scale;
		this.window_width = globalThis.two.width;
		this.window_height = globalThis.two.height;
		this.scale = utils.clamp( scale, 0.01, 5 );
		this.renderLayers['tank'].scale = this.scale;
		// small adjustment to keep screen centered
		const xdiff = ( this.window_width * prev_scale ) - ( this.window_width * this.scale );
		this.renderLayers['tank'].position.x += xdiff * 0.5;
		const ydiff = ( this.window_height * prev_scale ) - ( this.window_height * this.scale );
		this.renderLayers['tank'].position.y += ydiff * 0.5;
		// if ( this.braingraph ) {
		// 	this.braingraph.onScreenSizeChange();
		// }
	}
		
	// for adjusting camera position in smaller increments.
	// x and y are SCREEN pixel units
	// z is the absolute zoom diff (not a percentage). For that, use ZoomAt()
	MoveCamera( x, y, z=null ) {
		this.PointCameraAt( 
			this.x + ( x / this.z ), 
			this.y + ( y / this.z ), 
			this.z + (z||0)
		);
	}
		
	ZoomAt( screen_x, screen_y, zoom_in /* true for in, false for out */ ) {
		let newscale = this.z * ((1 + this.z/3)/1);
		if ( zoom_in ) { newscale = this.z * (1/(1 + this.z/3)); }
		// record mouse click in world space
		const [prev_x, prev_y] = this.ScreenToWorldCoord( screen_x, screen_y );
		// zoom into center of screen
		const [world_x, world_y] = this.ScreenToWorldCoord(this.window_width * 0.5, this.window_height * 0.5);
		this.PointCameraAt( world_x, world_y, newscale );
		// where would the mouse point be now?
		const [new_x, new_y] = this.ScreenToWorldCoord( screen_x, screen_y );
		// move screen to maintain the offset from click point
		this.PointCameraAt( world_x - (new_x - prev_x), world_y - (new_y - prev_y) );
	}
			
	DramaticEntrance( time=3.5 ) {
		if ( !this.dramatic_entrance ) { return false; }
		if ( this.dramatic_entrance !== true ) {
			this.dramatic_entrance = false;
		}
		const layers = [
			this.renderLayers['bg'],
			this.renderLayers['rocks'],
			this.renderLayers['plants'],
			this.renderLayers['boids'],
			this.renderLayers['foods'],
			this.renderLayers['marks'],
		];	
		const time_per_layer = ( time / layers.length ) * 1000;
		let last_tween;
		for ( let i=0; i < layers.length; i++ ) {
			layers[i].opacity=0;
			const delay = i * time_per_layer;
			const tween = new TWEEN.Tween(layers[i])
				.to( { opacity: (!i?0.35:1) }, time_per_layer )
				.easing(this.easing);
			if ( last_tween ) { last_tween.chain(tween); }	
			if ( !last_tween ) { tween.start(); }
			last_tween = tween;
		}
	}
	
	RescaleBackground() {
		// scale the background to cover the tank.
		// because of various rescaling calls, the background may not be 100% of the tank size,
		// and the tank size may not match the screen. there are two levels of scaling going on.
		
		// if the background is attached to the tank, make sure the layers are nested correctly
		if ( this.background_attachment == 'tank' ) {
			if ( this.renderLayers['bg'].parent !== this.renderLayers['tank'] ) {
				this.renderLayers['tank'].add(this.renderLayers['bg']);
			}
		}
	
		// get normalized coordinates of the background layer as-is
		this.renderLayers['bg'].scale = 1; // reset to get accurate coords
		let coords = this.renderLayers['bg'].getBoundingClientRect();
		
		// decide which container we are scaling for: screen or tank
		let container = this.background_attachment == 'screen' ? globalThis.two : this.renderLayers['tank'];
		
		// calculate scaling bg_layer -> container
		const scale_x = container.width / coords.width;
		const scale_y = container.height / coords.height;
		
		// scale to stretch:
		this.renderLayers['bg'].scale = new Two.Vector(scale_x, scale_y);	
		
		// alternative scale to fit/cover:
		// const scale = Math.max( scale_x, scale_y );
		// renderLayers['bg'].scale = scale;
	}
	
	// if force is FALSE, `responsive_tank_size` setting will be honored
	ResizeTankToWindow( force=false ) {
		// if ( this.tank ) {
		// 	if ( this.responsive_tank_size || force ) {
		// 		this.tank.Resize(this.window_width / this.scale, this.window_height / this.scale);
		// 		this.renderLayers['tank'].position.x = 0;
		// 		this.renderLayers['tank'].position.y = 0;
		// 		this.min_zoom = Math.min(this.window_width / this.tank_width, this.window_height / this.tank_height);
		// 	}
		// 	else { 
		// 		this.tank.ScaleBackground(); 
		// 	}
		// }
	}
			
	SetRenderStyle( style ) {
		// this.render_style = style;
		// // there are a few global issues we need to sort out first
		// if ( style != 'Natural' ) {
		// 	if ( this.tank.bg ) { this.tank.bg.visible = false; }
		// 	globalThis.vc.animate_boids = false;
		// 	globalThis.vc.animate_plants = false;
		// 	let bg_theme = 'Abysmal';
		// 	if ( style == 'Zen' ) { bg_theme = 'White'; }
		// 	else if ( style == 'Grey' ) { bg_theme = 'Grey'; }
		// 	this.tank.SetBGTheme( bg_theme, false ); // don't save
		// }
		// else {
		// 	if ( this.tank.bg ) { this.tank.bg.visible = true; }
		// 	this.tank.SetBGTheme();
		// 	globalThis.vc.animate_boids = true;
		// 	globalThis.vc.animate_plants = true;
		// }
		// // we need to update all the objects currently in the world and force them to switch geometry
		// for ( let x of this.tank.boids ) { x.body.UpdateGeometry(); }
		// for ( let x of this.tank.obstacles ) { x.UpdateGeometry(); }
		// for ( let x of this.tank.foods ) { x.UpdateGeometry(); }
		// for ( let x of this.tank.plants ) { x.CreateBody(); }
	}
		
	PickRandomObjectOfType( type ) {
		return Array.from( this.renderObjects.values() ).filter( o => o.type === type ).pickRandom();
	}
	
	CinemaMode( x=true ) { 
		this.cinema_mode = !!x;
		
		// turn off cinema mode
		if ( !x ) {
			// do nothing
			if ( this.cinema_timeout ) {
				clearTimeout(this.cinema_timeout);
				this.cinema_timeout = null;
			}
			if ( this.tween ) {
				this.tween.stop();
				this.tween = null;
			}
			this.TrackObject(false);
			return;
		}
		
		// cancel any previous tracking action
		this.TrackObject(false);
		if ( this.tween ) {
			this.tween.stop();
			this.tween = null;
		}
		
		// random chance to do a few basic options
		const r = Math.random();
		// focus on a boid
		if ( r < 0.3 ) {
			// pick a boid and chase it down
			const b = this.PickRandomObjectOfType('boid');
			if ( b ) {
				const zoom = utils.BiasedRand( 
					this.min_zoom,
					this.max_zoom,
					this.min_zoom + (this.max_zoom - this.min_zoom) / 3, // div by three to shift towards zoomed out
					0.5 
					);
				if ( this.transitions ) {
					const to = { x: b.x, y: b.y, z: zoom };
					this.tween = new TWEEN.Tween(this)
						.to(to, this.transition_time )
						.easing(this.easing)
						.dynamic(true)
						.onUpdate( obj => {
							// check if the object still exists
							if ( !this.renderObjects.has(b.oid) ) { 
								this.tween.stop();
								this.tween = null;
								this.cinema_timeout = setTimeout( _ => this.CinemaMode(), 2500 ); 		
							}
							else {
								to.x = b.x;
								to.y = b.y;
								this.PointCameraAt( this.x, this.y, this.z );
							}
						})
						// switch to absolute tracking after chase completed
						.onComplete( obj => {
							this.TrackObject(b.oid);
							this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time ); 			
						})
						.start();
				}
				else {
					this.PointCameraAt( b.x, b.y, zoom );
					this.TrackObject(b.oid);
					this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time );
				}
			return;
			}
		}
		// focus on a point of interest
		if ( r < 0.85 ) {
			// stop tracking stuff
			this.TrackObject(false);
			// zoom setup
			let zoom = this.z;
			// if transitions are enabled, reduce zoom changes to preserve frame rate and viewer sanity
			let zoom_change_chance = this.transitions ? 0.2 : 0.65;
			// if the entire tank fits in the scene, we MUST zoom in
			const scalex = this.window_width / this.tank_width;
			const scaley = this.window_height / this.tank_height;
			const scale = Math.min(scalex,scaley); // min = contain, max = cover
			if ( this.z <= scale ) { zoom_change_chance = 1; }
			// when changing zoom, pick from the larger perspective most of the time
			if ( Math.random() < zoom_change_chance ) {
				zoom = utils.RandomFloat( this.min_zoom, this.max_zoom );
				zoom = utils.shapeNumber( zoom, this.min_zoom, this.max_zoom, 0.25, 3 );
			}
			const roll = Math.random();
			// random point in space to fall back on if nothing is in tank
			let target_x = this.tank_width * Math.random();
			let target_y = this.tank_height * Math.random();
			let obj = null;
			// rock
			if ( roll < 0.25 ) {
				obj = this.PickRandomObjectOfType('obstacle');
				if ( obj ) {
					// pick a point on the hull, not on the interior
					const pt = obj.geodata.hull.pickRandom();
					target_x = obj.x + pt[0];
					target_y = obj.y + pt[1];
				}
			}
			// plant
			if ( !obj && roll < 0.5 ) {
				obj = this.PickRandomObjectOfType('plant');
				if ( obj ) {
					// pick a point near but slightly above the base
					target_x = obj.x;
					target_y = obj.y - 200;
				}
			}
			// boid
			if ( !obj && roll < 0.90 ) {
				obj = this.PickRandomObjectOfType('boid');
				if ( obj ) {
					target_x = obj.x;
					target_y = obj.y;
				}
			}
			// food particle
			if ( !obj ) {
				obj = this.PickRandomObjectOfType('food');
				if ( obj ) {
					target_x = obj.x;
					target_y = obj.y;
				}
			}
			// adjust point to sit inside a margin to avoid pan/zoom jank
			// Note: margin gets too big when zoom number is too small.
			const margin_x = Math.min( this.tank_width/2, Math.max( 0, ( this.window_width / 2 )  / zoom ) ); 
			const margin_y = Math.min( this.tank_height/2, Math.max( 0, ( this.window_height / 2 ) / zoom ) );
			target_x = utils.Clamp( target_x, margin_x, this.tank_width - margin_x );
			target_y = utils.Clamp( target_y, margin_y, this.tank_height - margin_y );
			if ( this.transitions ) {
				this.tween = new TWEEN.Tween(this)
					.to({
						x: target_x, 
						y: target_y,
						z: zoom
					}, this.transition_time )
					.easing(TWEEN.Easing.Sinusoidal.InOut)
					.onUpdate( obj => {
						this.PointCameraAt( this.x, this.y, this.z );
					})
					.onComplete( obj => {
						this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time );
					})
					.start();
			}
			else {
				this.PointCameraAt( target_x, target_y, zoom );
				this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time );
			}
			return;
		}
		// whole scene
		if ( this.transitions ) {
			this.tween = new TWEEN.Tween(this)
				.to({
					x: this.tank_width/2, 
					y: this.tank_height/2,
					z: this.min_zoom
				}, this.transition_time )
				.easing(TWEEN.Easing.Sinusoidal.InOut)
				.onUpdate( obj => {
					this.PointCameraAt( this.x, this.y, this.z, true );
				})
				.onComplete( obj => {
					this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time ); 			
				})
				.start();			
		}
		else {
			this.ResetCameraZoom();
			this.cinema_timeout = setTimeout( _ => this.CinemaMode(), this.focus_time );
		}
		return;
	}

	AdjustBackgroundForParallax() {
		// // static background provides faux parallax
		// if ( !this.parallax ) { return; }
		// // true parallax
		// const margin = 0.0001;
		// const max_x = -margin + (this.tank_width * this.scale) - (this.window_width);
		// const max_y = -margin + (this.tank_height * this.scale) - (this.window_height);
		// const scalex = this.window_width / this.tank_width;
		// const scaley = this.window_height / this.tank_height;
		// const minscale = Math.min(scalex,scaley); // min = contain, max = cover
		// const bgscale = this.renderLayers['tank'].scale /  minscale;
		// if ( bgscale != this.renderLayers['backdrop'].scale ) { // optimization to dodge setScale()
		// 	this.renderLayers['backdrop'].scale = bgscale;
		// }
		// const xpct = -utils.Clamp( this.renderLayers['tank'].position.x / max_x, -1, 1);
		// const ypct = -utils.Clamp( this.renderLayers['tank'].position.y / max_y, -1, 1);
		// const xrange = this.window_width * (this.renderLayers['backdrop'].scale - 1);
		// const yrange = this.window_height * (this.renderLayers['backdrop'].scale - 1);
		// this.renderLayers['backdrop'].position.x = -(xpct * (xrange/2)) - (xrange/4);
		// this.renderLayers['backdrop'].position.y = -(ypct * (yrange/2)) - (yrange/4);
		// // console.log(
		// // 	this.renderLayers['tank'].position.x,
		// // 	this.renderLayers['tank'].position.y,
		// // 	this.renderLayers['backdrop'].position.x,
		// // 	this.renderLayers['backdrop'].position.y
		// // );
		// // adjustment for hyperzoomed situations
		// if ( this.renderLayers['tank'].position.x > 0 || this.renderLayers['tank'].position.y > 0 ) {
		// 	// if ( this.tank.bg ) { 
		// 	// 	this.renderLayers['backdrop'].scale = 1;
		// 	// 	let rect = this.renderLayers['backdrop'].getBoundingClientRect(true);
		// 	// 	// console.log(rect.width, this.tank_width);
		// 	// 	// this.tank.bg.remove();
		// 	// 	// this.renderLayers['backdrop'].add(this.tank.bg);
		// 	// 	this.renderLayers['backdrop'].scale = new Two.Vector( 
		// 	// 		this.tank_width / rect.width,
		// 	// 		this.tank_height / rect.height 
		// 	// 	);
		// 	// }
		// 	// this.tank.ScaleBackground();
		// 	this.renderLayers['backdrop'].position.x = this.renderLayers['tank'].position.x;
		// 	this.renderLayers['backdrop'].position.y = this.renderLayers['tank'].position.y;
		// 	// console.log('adjusting backdrop',
		// 	// 	this.renderLayers['backdrop'].position.x,
		// 	// 	this.renderLayers['backdrop'].position.y,
		// 	// 	this.renderLayers['backdrop'].scale,
		// 	// );
		// }
	}
	
}