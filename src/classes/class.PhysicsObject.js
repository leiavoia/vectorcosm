/* <AI>
PhysicsObject — base class for all moving entities (Boid, Food).

OVERVIEW
- x, y, vel_x, vel_y, accel_x, accel_y, mass.
- `ApplyForce(fx, fy)` — accumulates acceleration (F = ma).
- Split-phase Euler integration (preferred for dissipative drag):
    1. `UpdateVelocity(dt)` — integrate accel into vel, clamp to MAX_SPEED, clear accel.
    2. (caller applies drag externally between these two calls)
    3. `StepPosition(dt)` — advance x/y by vel.
- `UpdatePosition(dt)` — convenience wrapper: UpdateVelocity + StepPosition, no drag split.
- `Slide(overlap_x, overlap_y, friction)` — projects velocity onto collision tangent for wall/rock sliding.
- MAX_SPEED = 2800 sanity cap applied in UpdateVelocity.
</AI> */

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

	// Modified Euler integration — split into two phases so dissipative forces (drag)
	// can be inserted between them. Correct order:
	//   UpdateVelocity(dt)   — integrate motor forces into velocity
	//   DampVelocity(...)         — apply analytical drag to the updated velocity
	//   StepPosition(dt)     — advance position using the fully-resolved velocity
	//
	// UpdatePosition() is preserved as a convenience for callers that need no drag split.

	// Phase 1: integrate accumulated forces into velocity, then clear acceleration.
	UpdateVelocity(deltaTime) {
		this.vel_x += this.accel_x * deltaTime;
		this.vel_y += this.accel_y * deltaTime;

		// Cap linear velocity
		const speed = Math.sqrt(this.vel_x * this.vel_x + this.vel_y * this.vel_y);
		if ( speed > PhysicsObject.MAX_SPEED ) {
			const scale = PhysicsObject.MAX_SPEED / speed;
			this.vel_x *= scale;
			this.vel_y *= scale;
		}

		this.accel_x = 0;
		this.accel_y = 0;
	}

	// Phase 2: advance position using current velocity (post-drag).
	StepPosition(deltaTime) {
		this.x += this.vel_x * deltaTime;
		this.y += this.vel_y * deltaTime;
	}

	// Convenience: full update with no drag split (classic callers unchanged).
	UpdatePosition(deltaTime) {
		this.UpdateVelocity(deltaTime);
		this.StepPosition(deltaTime);
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

	// Analytical (exponential) linear drag — exact solution to dv/dt = -(k) * v
	// where k = coefficient * viscosity * radius / mass.
	// Unconditionally stable: velocity decays smoothly to zero regardless of delta,
	// mass, or radius. Replaces force-based AddDrag to prevent Euler overcompensation
	// oscillation when c/m * dt > 1 (e.g. small or dying food particles).
	DampLinearVelocity( radius, viscosity, coefficient, deltaTime ) {
		const k = coefficient * viscosity * radius / Math.max(this.mass, PhysicsObject.MIN_MASS);
		const damping = Math.exp( -k * deltaTime );
		this.vel_x *= damping;
		this.vel_y *= damping;
	}

	// Analytical (exponential) angular drag — exact solution to d(ang_vel)/dt = -(k) * ang_vel
	// where k = coef * viscosity * length / mass.
	// Unconditionally stable: angular velocity decays smoothly to zero regardless of step size.
	// Replaces force-based rotational drag to prevent Euler overcompensation on rotation.
	// Requires subclass to have an `ang_vel` property.
	DampAngularVelocity( coef, viscosity, length, deltaTime ) {
		const k = coef * viscosity * length / Math.max(this.mass, PhysicsObject.MIN_MASS);
		const damping = Math.exp( -k * deltaTime );
		this.ang_vel *= damping;
	}
	
	// Analytical directional (hydrodynamic) drag using the exact solution to the quadratic drag ODE:
	// dv/dt = -k * v * |v|  =>  v(t+dt) = v / (1 + k * |v| * dt)
	// Unconditionally stable: |v_new| < |v| always — velocity can never reverse from drag alone.
	// Uses the same forward/lateral coefficients as previous ApplyHydrodynamicDrag so feel is identical,
	// but without the Euler overcompensation oscillation at large dt or high speed.
	// Call this AFTER UpdatePosition so motor forces integrate first (operator splitting).
	DampHydrodynamicVelocity( length, width, heading, viscosity, dragLong=0.05, dragLat=0.5, deltaTime ) {
		const forward_x = Math.cos(heading);
		const forward_y = Math.sin(heading);
		const lateral_x = -forward_y;
		const lateral_y =  forward_x;

		// Project velocity onto forward and lateral axes
		const v_fwd = this.vel_x * forward_x + this.vel_y * forward_y;
		const v_lat = this.vel_x * lateral_x + this.vel_y * lateral_y;

		// Drag coefficients
		const k_long = dragLong * (length * width) * viscosity / PhysicsObject.MAX_SPEED;
		const k_lat  = dragLat  *  length          * viscosity / PhysicsObject.MAX_SPEED;

		// Analytical quadratic decay
		const v_fwd_new = v_fwd / (1 + k_long * Math.abs(v_fwd) * deltaTime);
		const v_lat_new = v_lat / (1 + k_lat  * Math.abs(v_lat) * deltaTime);

		// Reconstruct world-space velocity
		this.vel_x = v_fwd_new * forward_x + v_lat_new * lateral_x;
		this.vel_y = v_fwd_new * forward_y + v_lat_new * lateral_y;
	}

}