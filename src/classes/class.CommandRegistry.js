/* <AI>
CommandRegistry — Self-describing command dispatch table.

OVERVIEW
- Stores commands with metadata (name, description, params, returns, handler, self_post).
- .register(descriptor) — add a command. Throws if name missing or duplicate.
- .list() — returns array of all command metadata (no handlers).
- .describe(name) — returns full descriptor for one command (no handler).
- .execute(name, params) — runs handler with try/catch, returns { ok, result } or { ok, error }.
- .has(name) — check if command exists.
- .isSelfPost(name) — returns true if the command manages its own postMessage response.

USAGE
  const commands = new CommandRegistry();
  commands.register({ name: 'ping', description: 'Health check', handler: () => 'pong' });
  const result = await commands.execute('ping');
  // => { ok: true, result: 'pong' }

  // Self-post commands handle their own response (e.g. frame data with Transferables):
  commands.register({ name: 'update', self_post: true, handler: (params) => { ... } });
  // Framework skips auto-response for self_post commands.

DESIGN
- Importable by both worker and main thread — no DOM/browser dependencies.
- Handlers may be sync or async — execute() always returns a Promise.
- All command names are snake_case. No aliases — callers are updated in lockstep.
- self_post: true marks commands that post their own response (framework skips auto-respond).
</AI> */

export default class CommandRegistry {

	constructor() {
		/** @type {Map<string, {name:string, description:string, params:Object, returns:Object, handler:Function, self_post:boolean}>} */
		this.commands = new Map();
	}

	/**
	 * Register a command with metadata.
	 * @param {Object} descriptor
	 * @param {string} descriptor.name — unique command name (snake_case)
	 * @param {string} [descriptor.description] — human-readable description
	 * @param {Object} [descriptor.params] — parameter schema { paramName: { type, optional, description } }
	 * @param {Object} [descriptor.returns] — return value schema { description }
	 * @param {boolean} [descriptor.self_post] — if true, handler manages its own postMessage (framework skips auto-response)
	 * @param {Function} descriptor.handler — the function to execute
	 */
	register( descriptor ) {
		if ( !descriptor || !descriptor.name ) {
			throw new Error( 'CommandRegistry.register: descriptor must have a name' );
		}
		if ( typeof descriptor.handler !== 'function' ) {
			throw new Error( `CommandRegistry.register: "${descriptor.name}" must have a handler function` );
		}
		if ( this.commands.has( descriptor.name ) ) {
			throw new Error( `CommandRegistry.register: "${descriptor.name}" is already registered` );
		}
		this.commands.set( descriptor.name, {
			name: descriptor.name,
			description: descriptor.description || '',
			params: descriptor.params || {},
			returns: descriptor.returns || {},
			self_post: !!descriptor.self_post,
			handler: descriptor.handler,
		} );
	}

	/**
	 * Check if a command exists.
	 * @param {string} name
	 * @returns {boolean}
	 */
	has( name ) {
		return this.commands.has( name );
	}

	/**
	 * Check if a command manages its own postMessage response.
	 * @param {string} name
	 * @returns {boolean}
	 */
	isSelfPost( name ) {
		return this.commands.get( name )?.self_post ?? false;
	}

	/**
	 * List all commands with metadata (no handlers).
	 * @returns {Array<{name:string, description:string, params:Object, returns:Object}>}
	 */
	list() {
		const result = [];
		for ( const [ , cmd ] of this.commands ) {
			result.push( {
				name: cmd.name,
				description: cmd.description,
				params: cmd.params,
				returns: cmd.returns,
			} );
		}
		return result;
	}

	/**
	 * Describe a single command (no handler).
	 * @param {string} name
	 * @returns {Object|null}
	 */
	describe( name ) {
		const cmd = this.commands.get( name );
		if ( !cmd ) { return null; }
		return {
			name: cmd.name,
			description: cmd.description,
			params: cmd.params,
			returns: cmd.returns,
		};
	}

	/**
	 * Execute a command by name.
	 * @param {string} name
	 * @param {*} params — passed to the handler
	 * @returns {Promise<{ok:boolean, result?:*, error?:string, stack?:string}>}
	 */
	async execute( name, params ) {
		const cmd = this.commands.get( name );
		if ( !cmd ) {
			return { ok: false, error: `Unknown command: "${name}"` };
		}
		try {
			const result = await cmd.handler( params );
			return { ok: true, result };
		}
		catch ( err ) {
			return { ok: false, error: err.message, stack: err.stack };
		}
	}
}
