/* <AI>
transports.js — Transport adapters for the Vectorcosm wire protocol.

Each transport wraps a message-passing mechanism with a uniform interface:
  send(msg)              — send a structured object to the other side
  onMessage(handler)     — register a single message handler (last wins)

Transports:
  PostMessageTransport    — browser Web Worker (postMessage / onmessage)
  WorkerThreadTransport   — Node.js worker_threads (postMessage / on('message'))

Future:
  SocketTransport         — TCP/Unix socket, newline-delimited JSON
  StdioTransport          — stdin/stdout for C++ child processes
</AI> */

// browser Web Worker transport
export class PostMessageTransport {
	constructor( worker ) {
		this.worker = worker;
	}
	send( msg ) {
		this.worker.postMessage( msg );
	}
	onMessage( handler ) {
		this.worker.onmessage = ( event ) => handler( event.data );
	}
}

// Node.js worker_threads transport
export class WorkerThreadTransport {
	constructor( worker ) {
		this.worker = worker;
	}
	send( msg ) {
		this.worker.postMessage( msg );
	}
	onMessage( handler ) {
		this.worker.on( 'message', handler );
	}
}
