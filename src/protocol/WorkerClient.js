/* <AI>
WorkerClient — Shared protocol client for all Vectorcosm consumers.

Replaces the 4 independent send()/pending-map implementations in:
  VectorcosmAPI (browser GUI), lab.js, run-sim.js, run-experiment.js

PROTOCOL (v1): see protocol.md
  Request:  { type:'request', command, params, id, v:1 }
  Response: { type:'response', command, id, ok, result, error }
  Event:    { type:'event', name, data }
  Frame:    { type:'frame', data }

API:
  client.call(command, params)     → Promise<result>  (request-response, auto-id)
  client.send(command, params)     → void             (fire-and-forget, no id, no response)
  client.on(eventName, handler)    → void             (subscribe to events/frames)
  client.off(eventName, handler)   → void             (unsubscribe)
  client.onAny(handler)            → void             (subscribe to all events)
  client.offAny(handler)           → void             (unsubscribe from all events)

OPTIONS:
  prefix       — id prefix string (default: 'c')
  timeout      — ms before pending call rejects (default: 30000, 0 = no timeout)
</AI> */

const PROTOCOL_VERSION = 1;

export default class WorkerClient {

	constructor( transport, options = {} ) {
		this.transport = transport;
		this.prefix = options.prefix || 'c';
		this.timeout = options.timeout ?? 30000;

		// pending call() Promises keyed by id string
		this._pending = new Map();
		this._nextId = 1;

		// event listeners: name → Set<handler>
		this._listeners = new Map();
		// catch-all listeners
		this._anyListeners = new Set();

		// wire up incoming messages
		this.transport.onMessage( ( msg ) => this._handleMessage( msg ) );
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	// request-response: returns Promise that resolves with result or rejects on error/timeout
	call( command, params = {} ) {
		return new Promise( ( resolve, reject ) => {
			const id = this.prefix + '-' + ( this._nextId++ );
			const envelope = { type: 'request', command, params, id, v: PROTOCOL_VERSION };

			// timeout guard
			let timer = null;
			if ( this.timeout > 0 ) {
				timer = setTimeout( () => {
					if ( this._pending.has( id ) ) {
						this._pending.delete( id );
						reject( new Error( `WorkerClient: call("${command}") timed out after ${this.timeout}ms` ) );
					}
				}, this.timeout );
			}

			this._pending.set( id, { resolve, reject, timer } );
			this.transport.send( envelope );
		} );
	}

	// fire-and-forget: no id, no response expected
	send( command, params = {} ) {
		this.transport.send( { type: 'request', command, params, v: PROTOCOL_VERSION } );
	}

	// subscribe to named events (or 'frame' for frame data)
	on( name, handler ) {
		if ( !this._listeners.has( name ) ) { this._listeners.set( name, new Set() ); }
		this._listeners.get( name ).add( handler );
	}

	off( name, handler ) {
		const set = this._listeners.get( name );
		if ( set ) { set.delete( handler ); }
	}

	// subscribe to all events
	onAny( handler ) { this._anyListeners.add( handler ); }
	offAny( handler ) { this._anyListeners.delete( handler ); }

	// ─── Internal routing ─────────────────────────────────────────────────────

	_handleMessage( msg ) {
		const type = msg?.type;

		// v1 response — resolve/reject pending Promise
		if ( type === 'response' ) {
			const entry = this._pending.get( msg.id );
			if ( entry ) {
				this._pending.delete( msg.id );
				if ( entry.timer ) { clearTimeout( entry.timer ); }
				if ( msg.ok ) {
					entry.resolve( msg.result );
				}
				else {
					entry.reject( new Error( msg.error || 'Worker error' ) );
				}
			}
			return;
		}

		// v1 event — fire named listeners + any-listeners
		if ( type === 'event' ) {
			const name = msg.name;
			const data = msg.data;
			const handlers = this._listeners.get( name );
			if ( handlers ) { for ( const h of handlers ) { h( data, name ); } }
			for ( const h of this._anyListeners ) { h( data, name ); }
			return;
		}

		// v1 frame — special event type for render data
		if ( type === 'frame' ) {
			const handlers = this._listeners.get( 'frame' );
			if ( handlers ) { for ( const h of handlers ) { h( msg.data ); } }
			for ( const h of this._anyListeners ) { h( msg.data, 'frame' ); }
			return;
		}

		// fallback: legacy message format (functionName-based) for backward compat during migration
		if ( msg.functionName !== undefined ) {
			const fname = msg.functionName;
			const data = msg.data;
			const rid = msg.request_id;

			// legacy response with request_id
			if ( rid && this._pending.has( String( rid ) ) ) {
				const entry = this._pending.get( String( rid ) );
				this._pending.delete( String( rid ) );
				if ( entry.timer ) { clearTimeout( entry.timer ); }
				if ( fname === 'error' ) {
					entry.reject( new Error( data?.message || 'Worker error' ) );
				}
				else {
					entry.resolve( data );
				}
				return;
			}

			// legacy event (no request_id): fire as event
			const handlers = this._listeners.get( fname );
			if ( handlers ) { for ( const h of handlers ) { h( data, fname ); } }
			for ( const h of this._anyListeners ) { h( data, fname ); }
		}
	}
}
