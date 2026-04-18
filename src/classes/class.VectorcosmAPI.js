/* <AI>
VectorcosmAPI — IPC bridge between the main thread and the simulation Web Worker.

OVERVIEW
- Thin wrapper around WorkerClient (src/protocol/WorkerClient.js).
- Constructs a PostMessageTransport internally; consumers just pass the raw Worker.
- `send(command, params)` — fire-and-forget. No response expected.
- `call(command, params)` — Promise-based request-response with auto-id + timeout.
- `on(name, handler)` / `off(name, handler)` — subscribe to events and frames.
  Event names match worker PubSub: sim_round, sim_complete, sim_new, records_push,
  boid_records_push, autosave, autonomous.stats. Use 'frame' for render data.
- `getHelp()` — calls 'help' command, returns Promise<Array>.
- `describe(name)` — calls 'describe' command, returns Promise<Object>.

USAGE
  // fire-and-forget
  api.send('update', { delta });
  api.send('init', { width: 1000, height: 800 });

  // request-response (Promise)
  const result = await api.call('pick_object', { x, y, radius: 60 });
  const cmds = await api.getHelp();

  // event subscription
  api.on('frame', renderData => { camera.ApplyRenderData(renderData); });
  api.on('sim_round', stats => { ... });
  api.on('autosave', data => { ... });

NAMING
- All command names are lowercase snake_case.
</AI> */

import WorkerClient from '../protocol/WorkerClient.js';
import { PostMessageTransport } from '../protocol/transports.js';

export default class VectorcosmAPI {
	constructor( worker ) {
		const transport = new PostMessageTransport( worker );
		this.client = new WorkerClient( transport, { prefix: 'gui', timeout: 0 } );
	}

	// request-response: returns Promise<result>
	call( command, params ) { return this.client.call( command, params ); }

	// fire-and-forget: no response expected
	send( command, params ) { this.client.send( command, params ); }

	// event / frame subscription
	on( name, handler ) { this.client.on( name, handler ); }
	off( name, handler ) { this.client.off( name, handler ); }

	/** Returns Promise<Array> — all registered commands with metadata. */
	getHelp() { return this.call( 'help' ); }

	/** Returns Promise<Object> — metadata for a single command. */
	describe( commandName ) { return this.call( 'describe', { name: commandName } ); }
}
