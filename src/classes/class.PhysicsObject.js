export default class PhysicsObject {

	static MAX_SPEED = 2800;
	static MIN_MASS = 0.001;

	constructor() {
		this.x = 0;
		this.y = 0;
		this.vel_x = 0;
		this.vel_y = 0;
		this.accel_x = 0;
		this.accel_y = 0;
		this.mass = 1;
	}
	
	MoveTo(x,y) {
		this.x = x;
		this.y = y;
	}
	
	ApplyForce(fx, fy) {
		// mass can't be zero
		if (this.mass < PhysicsObject.MIN_MASS || isNaN(this.mass) || !isFinite(this.mass)) {
			this.mass = PhysicsObject.MIN_MASS;
		}
		this.accel_x += fx / this.mass;
		this.accel_y += fy / this.mass;
	}

	// euler integration
	UpdatePosition(deltaTime) {
		// Update velocity with acceleration
		this.vel_x += this.accel_x * deltaTime;
		this.vel_y += this.accel_y * deltaTime;

		// Cap linear velocity
		const speed = Math.sqrt(this.vel_x * this.vel_x + this.vel_y * this.vel_y);
		if ( speed > PhysicsObject.MAX_SPEED ) {
			const scale = PhysicsObject.MAX_SPEED / speed;
			this.vel_x *= scale;
			this.vel_y *= scale;
		}

		// Update position with velocity
		this.x += this.vel_x * deltaTime;
		this.y += this.vel_y * deltaTime;

		// Reset acceleration for next frame
		this.accel_x = 0;
		this.accel_y = 0;
	}
	
	Slide( overlap_x, overlap_y, friction = 0.92 ) {
		// project velocity onto tangent
		let normal_x = overlap_x;
		let normal_y = overlap_y;
		// Tangent is perpendicular to normal
		let tangent_x = -normal_y;
		let tangent_y = normal_x;
		// Normalize tangent
		const mag = Math.sqrt(tangent_x * tangent_x + tangent_y * tangent_y);
		if ( mag > 0 ) {
			tangent_x /= mag;
			tangent_y /= mag;
		}
		// Project velocity onto tangent
		const v_dot_t = this.vel_x * tangent_x + this.vel_y * tangent_y;
		this.vel_x = v_dot_t * tangent_x;
		this.vel_y = v_dot_t * tangent_y;
		// apply friction to sliding
		this.vel_x *= friction;
		this.vel_y *= friction;
	}
	
	SlideAndBounce( overlap_x, overlap_y, friction = 0.92, bounce = 0.08 ) {
			
		// Calculate normal and tangent
		const normal_x = overlap_x;
		const normal_y = overlap_y;
		const tangent_x = -normal_y;
		const tangent_y = normal_x;

		// Normalize normal and tangent
		const normal_mag = Math.sqrt(normal_x * normal_x + normal_y * normal_y);
		const tangent_mag = Math.sqrt(tangent_x * tangent_x + tangent_y * tangent_y);
		let n_x = normal_x, n_y = normal_y, t_x = tangent_x, t_y = tangent_y;
		if (normal_mag > 0) {
			n_x /= normal_mag;
			n_y /= normal_mag;
		}
		if (tangent_mag > 0) {
			t_x /= tangent_mag;
			t_y /= tangent_mag;
		}

		// Project velocity onto normal and tangent
		const v_dot_n = this.vel_x * n_x + this.vel_y * n_y;
		const v_dot_t = this.vel_x * t_x + this.vel_y * t_y;

		// Bounce: reverse and scale normal component
		const bounce_x = -v_dot_n * n_x * bounce;
		const bounce_y = -v_dot_n * n_y * bounce;

		// Slide: keep tangent component with friction
		const slide_x = v_dot_t * t_x * friction;
		const slide_y = v_dot_t * t_y * friction;

		// New velocity is sum of bounce and slide
		this.vel_x = bounce_x + slide_x;
		this.vel_y = bounce_y + slide_y;	
	}
	
	// stay in the tank. Note: this code doesnt slide. bounce only.
	Constrain( bounce=0 ) {
		if ( this.x < 0 ) {
			this.x = 0;
			this.vel_x *= -bounce;
		} 
		else if ( this.x > globalThis.vc.tank.width ) {
			this.x = globalThis.vc.tank.width;
			this.vel_x *= -bounce;
		} 
		if ( this.y < 0 ) {
			this.y = 0;
			this.vel_y *= -bounce;
		} 
		else if ( this.y > globalThis.vc.tank.height ) {
			this.y = globalThis.vc.tank.height;
			this.vel_y *= -bounce;
		}	
	}
	
	// NOTE: this is primarily used to move food particles.
	// We can tune the numbers here to make it visually match
	// the way boids move under a different drag formula by
	// using a different drag coefficient (smoothness) in addition
	// to viscosity which affects all objects
	AddDrag( radius, viscosity=0.5, coefficient=6 ) {
		// stoke's drag formula for round objects:
		// drag = -6 * velocity * viscosity * radius
		const drag = -coefficient * viscosity * radius;
		const drag_x = drag * this.vel_x;
		const drag_y = drag * this.vel_y;
		this.ApplyForce(drag_x, drag_y);    
	}
	
	// this applies realistic drag physics to a "boat".
	// `length` = length of object (the broadside)
	// `width` = width of object (bow/face)
	// `heading` = direction of travel in world coordinates, in radians. Zero = positive x axis.
	// `dragLong` = Drag when traveling forward ("regular" drag)
	// `dragLat` = Drag when turning (prevents drifting)
	ApplyHydrodynamicDrag( length, width, heading, viscosity, dragLong=0.05, dragLat=0.5 ) {

		// `dragLong` controls how much the boat slows down when moving forward or backward.
		// `dragLat` controls how much the boat slows down when sliding sideways or turning.
		// If you make dragLong bigger, the boat will go slower in a straight line.
		// If you make dragLat bigger, the boat will have a harder time sliding or drifting 
		// sideways—it will “stick” more when turning.
	
		// To capture the effect that a longer boat exposes more of its long side when turning 
		// (and thus experiences more lateral drag), you should scale the lateral drag force by 
		// the boat’s length. This reflects the increased “side area” presented to the water when 
		// the boat moves sideways or turns.

		// The lateral drag area should be proportional to the boat’s length (not just length × width).
		// You can use areaLat = length * k, where k is a constant (often just 1, or you can tune it).
		// The longer the boat, the greater the lateral drag when turning.

		// Lateral drag (forceLat) is proportional to the boat’s length, 
		// so longer boats will “slide” less when turning, matching real hydrodynamics.
		// You can further tune the effect by adjusting the dragLat coefficient.

		// Forward and lateral direction unit vectors
		const forward_x = Math.cos(heading);
		const forward_y = Math.sin(heading);
		const lateral_x = -forward_y;
		const lateral_y =  forward_x;

		// Project velocity
		const v_forward = this.vel_x * forward_x + this.vel_y * forward_y;
		const v_lateral = this.vel_x * lateral_x + this.vel_y * lateral_y;

		// Effective "areas" (just scalers in this 2D sim)
		const areaLong = length * width;
		const areaLat  = length;

		const C_long = (this.mass * dragLong / PhysicsObject.MAX_SPEED) * areaLong * viscosity;
		const C_lat  = (this.mass * dragLat / PhysicsObject.MAX_SPEED) * areaLat  * viscosity;

		// Forces (quadratic, opposing velocity)
		let forceLong = -C_long * v_forward * Math.abs(v_forward);
		let forceLat  = -C_lat  * v_lateral * Math.abs(v_lateral);

		// Clamp to max physically reasonable drag
		const maxForceLong = this.mass * PhysicsObject.MAX_SPEED * PhysicsObject.MAX_SPEED;
		const maxForceLat  = this.mass * PhysicsObject.MAX_SPEED * PhysicsObject.MAX_SPEED;

		forceLong = Math.max(-maxForceLong, Math.min(forceLong, maxForceLong));
		forceLat  = Math.max(-maxForceLat,  Math.min(forceLat,  maxForceLat));

		// Convert to world space
		const fx = forceLong * forward_x + forceLat * lateral_x;
		const fy = forceLong * forward_y + forceLat * lateral_y;

		this.ApplyForce(fx, fy);
	}

}