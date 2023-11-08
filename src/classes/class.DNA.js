import * as utils from '../util/utils.js'
	
/*	
GENE STRUCTURE:
	Example: 0x123456
	1 = transform
	2 = number of chars to read
	3 = vertical shift
	4 = horizontal shift
	56 = seek location	
*/

export default class DNA {

	// `str` can be either a number of chars, or the entire string (copy)
	// default is 256 char DNA.
	constructor( str ) {
		if ( Number.isInteger(str) ) {
			this.str = DNA.Random(str);
		}
		else if ( str ) {
			this.str = str.replace(/\s+/g,'').replace(/^[0123456789ABCDEF]/ig, 0).toUpperCase();
		}
		else {
			this.str = DNA.Random(512);
		}
	}	

	toString() { return this.str; }

	static Random( chars=512 ) {
		const alphabet = '0123456789ABCDEF';
		let str = '';
		for ( let i=0; i < chars; i++ ) {
			str += alphabet.charAt( utils.RandomInt(0,15) );			
		}
		return str;
	}
		
	// returns a positive 64-bit Number		
	// `gene` = 2, 4, 6, or 8-char hex code, e.g. 0x12345678
	// `to_min` and `to_max` optionally constrain output
	read( gene, to_min=null, to_max=null  ) {
		gene = ( gene & 0xFFFFFFFF ) >>> 0; // blank out surplus bits
		const loc = gene & 0xFFFF;
		let hshift = gene >>> 16 & 15; // defaults to 1 if neither hshift or vshift are provided
		const vshift = gene >>> 20 & 15;
		const length = ( gene >>> 24 & 15 ) || 0xF;
		const transform = gene >>> 28 & 15;
		if ( !hshift && !vshift ) { hshift = 1; } // otherwise we just get a string of repeat chars
		// stay in the read-only section of DNA if the gene location starts in 0..0xFF safe zone
		const max_address = (loc >>> 8 & 0xFF) ? this.str.length : Math.min(this.str.length,0xFF);
		let str = '';
		for ( let n=0; n < length; n++ ) {
			str += this.str.charAt( utils.mod( loc + ( n * hshift ) + ( n * vshift * 16 ), max_address) ); 
		}
		let n = parseInt(str, 16);

		// scale the number back up if we only read a fraction of characters
		if ( length < 16 ) { 
			const max = parseInt( 'f'.repeat(length), 16 );
			const ratio = n / max;
			n = Math.round( ratio * 0xFFFFFFFFFFFFFFFF ); 
		};
				
		// scale to range				
		if ( to_min !== null && to_max !== null ) {
			const range_min = 0;
			const range_max = 0xFFFFFFFFFFFFFFFF;
			n = (to_max-to_min) * Math.abs( (n-range_min) / (range_max-range_min) ) + to_min;
		}
		return n;
	}
		
	mix( genes, to_min=null, to_max=null ) {
		let last = null;
		genes = Array.isArray(genes) ? genes : [genes];
		for ( let g of genes ) {
			let v = this.read( g ); // max 0xFFFFFFFFFFFFFFFF
			if ( last === null ) { last = v; }
			else {
				const transform = g >>> 28 & 15;
				if ( transform ) {
					switch ( transform ) {
						// case 0x2: // unused
						// case 0x3: // unused
						// case 0x4: // unused
						// case 0x5: // unused
						// case 0xC: // unused
						// bias
						case 0xB: {
							const influence = 0.25;
							last = v * (1 - influence) + last * influence;
							break;				
						}
						// modulo
						case 0xD: { last = utils.MapToRange( last % v, 0, v||1, 0, 0xFFFFFFFFFFFFFFFF ); break; }
						// reverse modulo
						case 0xE: { last = utils.MapToRange( v % last, 0, last||1, 0, 0xFFFFFFFFFFFFFFFF ); break; }
						// rotation ( 0xABC -> 0xBCA )
						case 0x7:
						case 0x6: {
							let hex = v.toString(16).padStart(16,'0');
							let rotations = Math.round( utils.MapToRange(last, 0, 0xFFFFFFFFFFFFFFFF, 0, 15 ) ) || 1;
							for ( let n=0; n < rotations; n++ ) {
								if ( transform === 0x6 ) {
									hex = hex.slice(-1) + hex.slice(0,-1);
								}
								else {
									hex = hex.slice(1) + hex.slice(0,1);
								}
							}
							last = parseInt( hex, 16 );
							break;
						}
						// invert
						case 0x1: last = 0xFFFFFFFFFFFFFFFF - v; break;
						// default: step-down average
						case 0x0:
						case 0xA:
						default: { last = (last + v) / 2; break; };
					}
				}
			}
		}
		return utils.Clamp( utils.MapToRange( last, 0, 0xFFFFFFFFFFFFFFFF, to_min, to_max ), to_min, to_max ) || 0;

	}
	
	
	// bias is the target average number you want, between min and max
	shapedNumber( genes, min=0, max=1, bias=0.5, influence=0 ) {
		let x = this.mix( genes, 0, 1 );
		if ( influence ) { // ironically, we ignore the influence
			bias = utils.MapToRange( bias, min, max, 0, 1 );
			bias = utils.Clamp(bias, 0.005, 0.995);
			// TODO: make a better shaping function, perhaps based on B-Splines
			// this is an inverted sigmoid with some constraints. 
			// this shapes x in range 0..1 to 0..1 on some bias.
			// this shaping function is not very good but it lets us move on with our lives.
			x = Math.log(x/(1-x)) * ((0.5-Math.abs(0.5-bias))/5) + bias;
			x = utils.Clamp(x,0,1);
		}
		// map back to desired range
		if ( min !== 0 || max !== 1 ) {
			x = utils.MapToRange( x, 0, 1, min, max );
		}
		return x;
	}
	
	shapedInt( genes, min=0, max=0, bias=0.5, influence=0 ) {
		return Math.round( this.shapedNumber( genes, min, max, bias, influence ) ); 
	}
	
	biasedRand( gene, min=0, max=1, bias=0.5, influence=0 ) {
		// NOTE: if the first gene is from the read-only group, the second gene must also be
		let gene2 = gene + 16;
		if ( !(gene >>> 8 & 0xFF) ) { gene2 = (gene2 & ~(0xFF << 8)) >>> 0; }
		const r1 = this.read( gene, 0, 1 );
		const r2 = this.read( gene2, 0, 1 );
		const rnd = r1 * (max - min) + min;   // random in range
		const mix = r2 * influence;   // random mixer - higher influence number means more spread
		return rnd * (1 - mix) + bias * mix;// mix full range and bias
	}
		
	biasedRandInt( gene, min, max, bias=0.5, influence=0 ) {
		return Math.floor( this.biasedRand(gene, min, max+0.99999, bias, influence) );
	}
	
	// returns string of a single gene created by hashing any arbitrary string
	// Useage: 
	// 	let gene = dna.geneFor('likes pie'); // returns 0xABC123
	geneFor( str, as_str=false, use_safe_zone=true ) {
		// use the same seed for the entire game
		// using a different seed per organism creates wild results if seed changes.
		let n = utils.murmurhash3_32_gc( str, 0x600DF00D );
		// zero out the 3rd and 4th position as a hint to the gene reader, e.g. 0xFFFF00FF 
		if ( use_safe_zone ) { n = (n & ~(0xFF << 8)) >>> 0; } 
		return as_str ? n.toString(16).padStart(8,'0') : n;
	}
	
	mutate( num_mutations=1, protect_read_only_zone=true ) {
		for ( let n = 0; n < num_mutations; n++ ) {
			const option = DNA.mutationOptionPicker.Pick();
			const first_char = (protect_read_only_zone && this.str.length > 0xFF) ? 0xFF+1 : 0;
			const i = utils.BiasedRandInt( first_char, this.str.length-1, 
				first_char + (((this.str.length-1)-first_char)/2), 0.5 ); // draw more from the middle
			const char = this.str.charAt(i);
			switch ( option ) {
				case 'increment': {
					const v = utils.mod( parseInt(char,16) + 1, 16 ).toString(16);
					this.putCharAt(i,v);
					break;
				}
				case 'decrement': {
					const v = utils.mod( parseInt(char,16) - 1, 16 ).toString(16);
					this.putCharAt(i,v);
					break;
				}
				case 'max': {
					this.putCharAt(i,'F');
					break;
				}
				case 'zero': {
					this.putCharAt(i,'0');
					break;
				}
				case 'copy_prev': {
					const neighbor = (!i) ? (this.str.length-1) : (i-1);
					this.putCharAt(i, this.str.charAt(neighbor));
					break;
				}
				case 'copy_next': {
					const neighbor = (i == this.str.length-1) ? 0 : (i+1);
					this.putCharAt(i, this.str.charAt(neighbor));
					break;
				}
				case 'swap_prev': {
					const neighbor = (!i) ? (this.str.length-1) : (i-1);
					if ( first_char && neighbor < first_char ) { continue; } // read-only defense
					this.putCharAt(i, this.str.charAt(neighbor));
					this.putCharAt(neighbor, char);
					break;
				}
				case 'swap_next': {
					const neighbor = (i == this.str.length-1) ? 0 : (i+1);
					if ( first_char && neighbor < first_char ) { continue; } // read-only defense
					this.putCharAt(i, this.str.charAt(neighbor));
					this.putCharAt(neighbor, char);
					break;
				}
				case 'randomize':
				default : {
					this.putCharAt(i, DNA.Random(1) );
					break;
				}
			}
		}
	}

	putCharAt( index, char ) {	
		this.str = this.str.split('');
		this.str.splice(index, 1, char.toUpperCase() )
		this.str = this.str.join('');
		}
		
	static mutationOptionPicker = new utils.RandomPicker( [
		['increment',	100],
		['decrement',	100],
		['randomize',	80],
		['max',			50],
		['zero',		40],
		['copy_prev',	40],
		['copy_next',	40],
		['swap_next',	20],
		['swap_prev',	20],
	] );
			
}