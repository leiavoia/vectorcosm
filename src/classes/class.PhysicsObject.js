export default class PhysicsObject {

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
		this.accel_x += fx / this.mass;
		this.accel_y += fy / this.mass;
	}

	// for euler
	UpdatePosition(deltaTime) {
		// Update velocity with acceleration
		this.vel_x += this.accel_x * deltaTime;
		this.vel_y += this.accel_y * deltaTime;
		
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
		
		// USE THIS CODE INSTEAD IF YOU DONT NEED BOUNCE
		// // Slide: project velocity onto tangent
		// let normal_x = result.overlap_x;
		// let normal_y = result.overlap_y;
		// // Tangent is perpendicular to normal
		// let tangent_x = -normal_y;
		// let tangent_y = normal_x;
		// // Normalize tangent
		// const mag = Math.sqrt(tangent_x * tangent_x + tangent_y * tangent_y);
		// if ( mag > 0 ) {
		// 	tangent_x /= mag;
		// 	tangent_y /= mag;
		// }
		// // Project velocity onto tangent
		// const v_dot_t = this.vel_x * tangent_x + this.vel_y * tangent_y;
		// this.vel_x = v_dot_t * tangent_x;
		// this.vel_y = v_dot_t * tangent_y;
		// // apply friction to sliding
		// const slide_friction = 0.92;
		// this.vel_x *= slide_friction;
		// this.vel_y *= slide_friction;
					
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
	
	AddDrag( radius, viscosity=0.5 ) {
		// stoke's drag formula for round objects
		// drag = -6 * velocity * viscosity * radius
		const drag_x = -6 * viscosity * this.vel_x * radius;
		const drag_y = -6 * viscosity * this.vel_y * radius;
		this.ApplyForce(drag_x, drag_y);	
	}
	
	// for verlet
	// UpdatePosition(deltaTime) {
		// // [!] temporary Dampener until we balance numbers
		// const TEMP_DAMPENER = 0.00001;
		// this.accel_x *= TEMP_DAMPENER;
		// this.accel_y *= TEMP_DAMPENER;
		
		// const dtSquared = deltaTime * deltaTime;

		// const temp_x = this.x;
		// const temp_y = this.y;

		// this.x += (this.x - this.prev_x) + this.accel_x * dtSquared;
		// this.y += (this.y - this.prev_y) + this.accel_y * dtSquared;

		// this.prev_x = temp_x;
		// this.prev_y = temp_y;

		// this.accel_x = 0;
		// this.accel_y = 0;
	// }
}