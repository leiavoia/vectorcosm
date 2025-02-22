export default class VectorcosmAPI  {
	constructor( worker ) {
		this.worker = worker;
		// expectations act like network ports. add API function name to explicity allow (true) or disallow (false).
		// unexpected functions coming from the simulation will be handled by default unless set to false.
		// making a function call automatically sets the expectation to true. 
		this.expect = {};
		// the function registry lets us register response callbacks from the simulation side
		this.function_registry = new Map();
		// broker incoming worker messages to the right response callback
		this.worker.onmessage = event => {
			const functionName = event?.data.functionName;
			if ( this.expect[functionName]===false ) { console.log('nope: ' + functionName); return false; }
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
		this.expect[functionName] = true;
		const packet = { functionName, data };
		this.worker.postMessage( packet );	
	}
}
