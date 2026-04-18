/* <AI>
cli/orchestrator.js — Multi-session simulation process manager.

Manages N parallel Node.js worker_threads, each running a full vectorcosm simulation.
Wraps each Worker with a WorkerClient (protocol v1 via WorkerThreadTransport).

ROLE: Simple process manager. No policy, no scheduling, no timing. Just wires up
workers and delegates IPC calls. Callers decide when to spawn, start, and stop.

API
  orch = new Orchestrator(options)
  await orch.spawn(name, initParams)         → sessionInfo   spawn worker + auto-init
  await orch.terminate(name)                 → finalReport   graceful terminate
  await orch.terminateAll()                  → void          terminate all in parallel
  orch.call(name, command, params)           → Promise<result>
  orch.send(name, command, params)           → void
  orch.sessions()                            → [ sessionInfo, ... ]
  orch.getSession(name)                      → sessionInfo | null
  await orch.pollStatus()                    → void   refresh last_status on all active sessions
  orch.on(name|'*', eventName, handler)      → void   handler: (sessionName, eventName, data)
  orch.off(name|'*', eventName, handler)     → void

EVENTS (internal, fired by Orchestrator itself)
  session.exit   { name, code }   fired when a worker process exits

SESSION STATUSES
  spawning → ready → stopped | crashed
  (status reflects lifecycle; use last_status.running for whether autonomous loop is active)
</AI> */

import { Worker }            from 'worker_threads';
import { fileURLToPath }     from 'url';
import { resolve, dirname }  from 'path';
import { WorkerThreadTransport } from '../src/protocol/transports.js';
import WorkerClient              from '../src/protocol/WorkerClient.js';

const __filename = fileURLToPath( import.meta.url );
const __dirname  = dirname( __filename );

const DEFAULT_WORKER_PATH = resolve( __dirname, '../src/workers/vectorcosm.worker.js' );

export default class Orchestrator {

	constructor( options = {} ) {
		this._workerPath = options.workerPath || DEFAULT_WORKER_PATH;
		this._sessions   = new Map();   // name → session object
		this._listeners  = new Map();   // key → Set<fn>  (key = 'sessionName:eventName')
	}

	// ─── Session Management ────────────────────────────────────────────────────

	// Spawn a new named session. Sends 'init' if initParams provided.
	// Resolves with a session descriptor when init completes (or immediately if no params).
	async spawn( name, initParams = null ) {
		if ( this._sessions.has( name ) ) {
			throw new Error( `Orchestrator: session "${name}" already exists.` );
		}

		const worker    = new Worker( this._workerPath );
		const transport = new WorkerThreadTransport( worker );
		const client    = new WorkerClient( transport, { prefix: name, timeout: 30000 } );

		const session = {
			name,
			status:      'spawning',
			worker,
			client,
			created:     Date.now(),
			last_status: null,
		};
		this._sessions.set( name, session );

		// Forward all worker events through the orchestrator event system
		client.onAny( ( data, eventName ) => {
			this._dispatch( name, eventName, data );
		} );

		// Track worker process exit
		worker.once( 'exit', ( code ) => {
			const s = this._sessions.get( name );
			if ( s && s.status !== 'stopped' ) {
				s.status = code === 0 ? 'stopped' : 'crashed';
				this._dispatch( name, 'session.exit', { name, code } );
			}
		} );

		if ( initParams ) {
			await client.call( 'init', initParams );
		}
		session.status = 'ready';
		return this._descriptor( session );
	}

	// Gracefully terminate a session: send terminate command, then destroy the worker.
	// Returns the final report from the worker, or null if already stopped/timed out.
	async terminate( name ) {
		const session = this._sessions.get( name );
		if ( !session ) { throw new Error( `Orchestrator: session "${name}" not found.` ); }

		if ( session.status === 'stopped' || session.status === 'crashed' ) {
			session.worker.terminate();
			return null;
		}

		let finalReport = null;
		try {
			finalReport = await session.client.call( 'terminate', {} );
		}
		catch ( e ) {
			// Worker may have already exited or call timed out — fall through to force kill
		}
		session.worker.terminate();
		session.status = 'stopped';
		return finalReport;
	}

	// Terminate all sessions in parallel. Settles all promises before returning.
	async terminateAll() {
		const names = Array.from( this._sessions.keys() );
		await Promise.allSettled( names.map( n => this.terminate( n ) ) );
	}

	// ─── IPC Delegation ───────────────────────────────────────────────────────

	call( name, command, params = {} ) {
		const s = this._sessions.get( name );
		if ( !s ) { return Promise.reject( new Error( `Orchestrator: session "${name}" not found.` ) ); }
		return s.client.call( command, params );
	}

	send( name, command, params = {} ) {
		const s = this._sessions.get( name );
		if ( !s ) { throw new Error( `Orchestrator: session "${name}" not found.` ); }
		s.client.send( command, params );
	}

	// ─── Event Subscription ───────────────────────────────────────────────────

	// Subscribe to a named event from a specific session, or from all sessions with '*'.
	// handler(sessionName, eventName, data)
	on( sessionFilter, eventName, handler ) {
		const key = `${sessionFilter}:${eventName}`;
		if ( !this._listeners.has( key ) ) { this._listeners.set( key, new Set() ); }
		this._listeners.get( key ).add( handler );
	}

	off( sessionFilter, eventName, handler ) {
		const key = `${sessionFilter}:${eventName}`;
		const set = this._listeners.get( key );
		if ( set ) { set.delete( handler ); }
	}

	_dispatch( sessionName, eventName, data ) {
		// session-specific listeners
		const sk = `${sessionName}:${eventName}`;
		const sh = this._listeners.get( sk );
		if ( sh ) { for ( const fn of sh ) { fn( sessionName, eventName, data ); } }
		// wildcard-session listeners
		const wk = `*:${eventName}`;
		const wh = this._listeners.get( wk );
		if ( wh ) { for ( const fn of wh ) { fn( sessionName, eventName, data ); } }
	}

	// ─── Session Info ──────────────────────────────────────────────────────────

	sessions() {
		return Array.from( this._sessions.values() ).map( s => this._descriptor( s ) );
	}

	getSession( name ) {
		const s = this._sessions.get( name );
		return s ? this._descriptor( s ) : null;
	}

	// Parallel-refresh last_status for all non-stopped sessions.
	// Tolerates failures silently (session may be stopping).
	async pollStatus() {
		const polls = [];
		for ( const s of this._sessions.values() ) {
			if ( s.status === 'stopped' || s.status === 'crashed' ) { continue; }
			polls.push(
				s.client.call( 'get_status', {} )
					.then( st => { s.last_status = st; } )
					.catch( () => {} )
			);
		}
		await Promise.allSettled( polls );
	}

	_descriptor( s ) {
		return {
			name:        s.name,
			status:      s.status,
			created:     s.created,
			last_status: s.last_status,
		};
	}

}
