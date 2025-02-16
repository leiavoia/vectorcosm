export default class GameLoop {
	constructor() {
		this.updates_per_frame = 1;
		this.throttle = 1.0;
		this.start_ts = 0;
		this.last_ts = 0;
		this.delta = 0;
		this.playing = false;
		this.drawing_finished = false;
		this.sim_finished = false;
		this.frame = 0;
		this.total_time = 0;
		this.fps = 0;
		this.fps_recs = [];
		this.max_fps_recs = 20;
		this.fps_avg = 0;
		this.max_delta = 1/30;
		this.drawtime_ts = 0;
		this.drawtime = 0;
		this.simtime_ts = 0;
		this.simtime = 0;
		this.waittime = 0;
		// lifecycle hooks you can use
		this.onStartFrame = null;
		this.onEndFrame = null;
		this.onStartSim = null;
		this.onStartDrawing = null;
		this.onEndSim = null;
		this.onEndDrawing = null;
	}
	Start( autoplay=true ) {
		// get stats based on previous frame.
		// Note: we have to incorporate time eaten up by requestAnimationFrame,
		// so we cannot record stats in the End() function. 
		this.last_ts = this.start_ts;
		this.start_ts = performance.now();
		this.delta = ( this.start_ts - this.last_ts ) / 1000; // TODO: watch out for time jumps from pausing
		this.total_time += this.delta;
		this.fps = 1 / this.delta;
		this.fps_recs.push(this.fps);
		if ( this.fps_recs.length > this.max_fps_recs ) {
			this.fps_recs.shift();
		}
		this.fps_avg = this.fps_recs.reduce( (a,b) => a+b, 0 ) / this.fps_recs.length;
		this.waittime = Math.max( 0, this.delta - ( this.drawtime + this.simtime ) );
		if ( this.onStartFrame ) { this.onStartFrame(); }
		// get the next frame going
		if ( autoplay || this.playing ) {
			this.playing = true;
			this.drawing_finished = false;
			this.sim_finished = false;
			this.StartSimFrame(this.delta);
			this.StartDrawing();	
		}
	}
	End() {
		if ( !this.drawing_finished || !this.sim_finished ) { return false; }
		if ( this.onEndFrame ) { this.onEndFrame(); }
		this.frame++;
		// kick off the next frame
		if ( this.playing ) {
			if ( typeof globalThis.requestAnimationFrame === 'function' ) {
				globalThis.requestAnimationFrame( _ => this.Start(false) );
			}
			else {
				setTimeout( _ => this.Start(false), 0 );
			}
		}
	}
	StartSimFrame(delta) {
		if ( delta > this.max_delta ) { delta = this.max_delta; }
		if ( this.throttle != 1 ) { delta *= this.throttle; }
		this.simtime_ts = performance.now();
		if ( this.onStartSim ) { this.onStartSim(delta); }
	}
	EndSimFrame() {
		this.simtime = ( performance.now() - this.simtime_ts ) / 1000;
		this.sim_finished = true;
		if ( this.onEndSim ) { this.onEndSim(); }
		this.End();
	}
	StartDrawing() {
		this.drawtime_ts = performance.now();
		if ( this.onStartDrawing ) { this.onStartDrawing(); }
		this.EndDrawing();
	}
	EndDrawing() {
		this.drawtime = ( performance.now() - this.drawtime_ts ) / 1000;
		this.drawing_finished = true;
		if ( this.onEndDrawing ) { this.onEndDrawing(); }
		this.End();
	}
}
