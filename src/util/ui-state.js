/* <AI>
UI state persistence helpers for the browser UI.

- Uses localStorage under a Vectorcosm-specific key prefix.
- JSON round-trips small UI-only state blobs.
- Fail-safe: invalid JSON, schema mismatches, or storage access errors fall back quietly.
</AI> */

const UI_STATE_PREFIX = 'vectorcosm.ui.';

function GetStorage() {
	try {
		return globalThis.localStorage || null;
	}
	catch ( err ) {
		return null;
	}
}

function CloneFallback( fallback ) {
	if ( Array.isArray(fallback) ) {
		return fallback.slice();
	}
	if ( fallback && typeof fallback == 'object' ) {
		return { ...fallback };
	}
	return fallback;
}

export function LoadUIState( key, fallback=null, sanitize=null ) {
	const storage = GetStorage();
	if ( !storage ) { return CloneFallback(fallback); }
	try {
		const raw = storage.getItem(UI_STATE_PREFIX + key);
		if ( raw === null ) { return CloneFallback(fallback); }
		const parsed = JSON.parse(raw);
		if ( sanitize ) {
			const sanitized = sanitize(parsed);
			return sanitized === undefined ? CloneFallback(fallback) : sanitized;
		}
		return parsed;
	}
	catch ( err ) {
		return CloneFallback(fallback);
	}
}

export function SaveUIState( key, value ) {
	const storage = GetStorage();
	if ( !storage ) { return; }
	try {
		storage.setItem(UI_STATE_PREFIX + key, JSON.stringify(value));
	}
	catch ( err ) {
		// localStorage quota/security failures are non-fatal for UI state.
	}
}