export default class VectorcosmAPI  {
	constructor( worker ) {
		this.worker = worker;
		this.function_registry = new Map();
		// broker incoming worker messages to the right response callback
		this.worker.onmessage = event => {
			const functionName = event?.data.functionName;
			const functionData = event?.data.data; // first data is the event's data. second data Vectorcosm response.
			const f = this.function_registry.get(functionName);
			return f ? f(functionData) : false;
		}
		// default response if the callback isnt registered
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
}
