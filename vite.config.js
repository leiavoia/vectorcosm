import {defineConfig} from 'vite'
import {svelte} from '@sveltejs/vite-plugin-svelte'
import {resolve} from 'path'

// https://vite.dev/config/
export default defineConfig({
	plugins: [ svelte() ],
	base: "./",
	// dynamic imports inside the worker require ES output (IIFE doesn't support code-splitting)
	worker: { format: 'es' },
	build: {
		// top-level await in worker requires a modern target; legacy support not needed
		target: 'esnext',
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				lab:  resolve(__dirname, 'lab.html'),
			}
		}
	}
})
