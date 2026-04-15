/* <AI>
VectorcosmAPI — IPC bridge between the main thread and the simulation Web Worker.

OVERVIEW
- Wraps `worker.postMessage` / `worker.onmessage` with a named-function dispatch table.
- `SendMessage(functionName, data)` — fire-and-forget. Posts { functionName, data } to the worker.
- `RegisterResponseCallback(functionName, cb)` — registers a handler for a named worker response.
- `call(commandName, data)` — Promise-based. Attaches a request_id; worker must echo it back. Rejects on 'error' response.
- `getHelp()` — calls 'help' command, returns Promise<Array> of all commands.
- `describe(name)` — calls 'describe' command, returns Promise<Object> for one command.
- Unregistered functions fall through to the 'default' handler (console.error).

USAGE
  // fire-and-forget (update loop, PubSub events)
  api.RegisterResponseCallback('update', renderData => { camera.ApplyRenderData(renderData); });
  api.SendMessage('update', { delta });

  // promise-based (one-shot commands)
  const cmds = await api.getHelp();
  const settings = await api.call('update_sim_settings', { num_boids: 30 });

NAMING
- All command names are lowercase snake_case.
</AI> */

export default class VectorcosmAPI  {
	constructor( worker ) {
		this.worker = worker;
		// the function registry lets us register response callbacks from the simulation side
		this.function_registry = new Map();
		// pending Promise resolvers for call() requests, keyed by request_id
		this._pending = new Map();
		this._next_request_id = 1;

		// broker incoming worker messages to the right response callback
		this.worker.onmessage = event => {
			const functionName = event?.data.functionName;
			const functionData = event?.data.data;

			// resolve/reject any pending call() promises
			if ( functionName === 'error' ) {
				const rid = event?.data.request_id;
				if ( rid && this._pending.has(rid) ) {
					const { reject } = this._pending.get(rid);
					this._pending.delete(rid);
					reject( new Error( functionData?.message || 'Worker error' ) );
				}
				// also fire registered error callback if present
				const errHandler = this.function_registry.get('error');
				if ( errHandler ) { errHandler(functionData); }
				return;
			}

			const rid = event?.data.request_id;
			if ( rid && this._pending.has(rid) ) {
				const { resolve } = this._pending.get(rid);
				this._pending.delete(rid);
				resolve(functionData);
				return;
			}

			// fire-and-forget path
			const f = this.function_registry.get(functionName);
			return f ? f(functionData) : false;
		};

		// default response if the callback isn't registered
		this.function_registry.set( 'default', data => {
			console.error('Unregistered worker function.', data);
		});
	}

	RegisterResponseCallback( functionName, cb ) {
		if ( typeof(cb) !== 'function' ) { return false; }
		this.function_registry.set( functionName, cb );
	}

	SendMessage( functionName, data ) {
		const packet = { functionName, data };
		this.worker.postMessage( packet );
	}

	/**
	 * Send a command and return a Promise that resolves with the response data.
	 * The worker must echo back the request_id field for correlation.
	 * Rejects if the worker posts an 'error' response with the same request_id.
	 * @param {string} commandName
	 * @param {*} data
	 * @returns {Promise<*>}
	 */
	call( commandName, data ) {
		return new Promise( (resolve, reject) => {
			const request_id = this._next_request_id++;
			this._pending.set( request_id, { resolve, reject } );
			this.worker.postMessage( { functionName: commandName, data, request_id } );
		} );
	}

	/** Returns Promise<Array> — all registered commands with metadata. */
	getHelp() {
		return this.call( 'help' );
	}

	/** Returns Promise<Object> — metadata for a single command. */
	describe( commandName ) {
		return this.call( 'describe', { name: commandName } );
	}
}
