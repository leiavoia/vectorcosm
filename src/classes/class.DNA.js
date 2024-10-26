import * as utils from '../util/utils.js'
	
/*	
GENE STRUCTURE:
	Example: 0x12345678
	1 = transform
	2 = number of chars to read
	3 = vertical shift
	4 = horizontal shift
	5678 = seek location	
*/

export default class DNA {

	// `str` can be either a number of chars, or the entire string (copy)
	// default is 512 char DNA.
	constructor( str ) {
		// actual numbers
		if ( Number.isInteger(str) ) {
			this.str = DNA.Random(str);
		}
		// string literals
		else if ( str && typeof str=='string' ) {
			this.str = str.replace(/\s+/g,'').replace(/^[0123456789ABCDEF]/ig, 0).toUpperCase();
		}
		// an object with "str" as a member
		else if ( typeof str === 'object' && 'str' in str ) {
			this.str = str.str;
		}
		// just make something up
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
		
	// returns a positive Number in the 32-bit range.		
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
		// scale the number back up if we only read a fraction of characters.
		// we need to use BigInt if the reading produces a string too big for regular Number format.
		// BigInt will not produce a nice decimal ratio and will always truncate to zero.
		// We need to reduce both numerator and denominator to fit into a regular number to do floating point math.
		// shove the final result back into a regular Number.
		let n = length <= 8 ? Number('0x'+str) : Number( BigInt('0x'+str) >> BigInt(length-8) );
		let max_int = length <= 8 ? Number('0x'+'F'.repeat(length)) : Number( BigInt('0x'+'F'.repeat(length)) >> BigInt(length-8) );
		const ratio = n / max_int;
		n = Math.round( Number( ratio * 0xFFFFFFFF ) );
		
		// scale to range				
		if ( to_min !== null && to_max !== null ) {
			const range_min = 0;
			const range_max = 0xFFFFFFFF;
			n = (to_max-to_min) * Math.abs( (n-range_min) / (range_max-range_min) ) + to_min;
		}
		return n;
	}
		
	mix( genes, to_min=null, to_max=null ) {
		let last = null;
		genes = Array.isArray(genes) ? genes : [genes];
		for ( let g of genes ) {
			let v = this.read( g );
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
						case 0xD: { last = utils.MapToRange( last % v, 0, v||1, 0, 0xFFFFFFFF ); break; }
						// reverse modulo
						case 0xE: { last = utils.MapToRange( v % last, 0, last||1, 0, 0xFFFFFFFF ); break; }
						// rotation ( 0xABC -> 0xBCA )
						case 0x7:
						case 0x6: {
							let hex = v.toString(16).padStart(8,'0');
							let rotations = ( last % 8 ) || 1;
							for ( let n=0; n < rotations; n++ ) {
								if ( transform === 0x6 ) { // forward
									hex = hex.slice(-1) + hex.slice(0,-1);
								}
								else { // backward
									hex = hex.slice(1) + hex.slice(0,1);
								}
							}
							last = parseInt( hex, 16 );
							break;
						}
						// invert
						case 0x1: last = 0xFFFFFFFF - v; break;
						// default: step-down average
						case 0x0:
						case 0xA:
						default: { last = (last + v) / 2; break; };
					}
				}
			}
		}
		let n = utils.MapToRange( last, 0, 0xFFFFFFFF, to_min, to_max );
		n = utils.Clamp( n, to_min, to_max ) || 0
		return n;

	}
	
	// // bias is the target average number you want, between min and max
	// shapedNumber( genes, min=0, max=1, bias=0.5, influence=0 ) {
	// 	let x = this.mix( genes, 0, 1 );
	// 	if ( influence ) { // ironically, we ignore the influence
	// 		bias = utils.MapToRange( bias, min, max, 0, 1 );
	// 		bias = utils.Clamp(bias, 0.005, 0.995);
	// 		// TODO: make a better shaping function, perhaps based on B-Splines
	// 		// this is an inverted sigmoid with some constraints. 
	// 		// this shapes x in range 0..1 to 0..1 on some bias.
	// 		// this shaping function is not very good but it lets us move on with our lives.
	// 		x = Math.log(x/(1-x)) * ((0.5-Math.abs(0.5-bias))/5) + bias;
	// 		x = utils.Clamp(x,0,1);
	// 	}
	// 	// map back to desired range
	// 	if ( min !== 0 || max !== 1 ) {
	// 		x = utils.MapToRange( x, 0, 1, min, max );
	// 	}
	
	// `target` is the average number you want, between min and max
	// `influence` is 0..1 for push-away, 1-5 for bring-together
	shapedNumber( genes, min=0, max=1, target=null, influence=1 ) {
		// shape the target number to a fractional bias
		if ( target === null ) { target = ( (max-min) / 2 ) + min; }
		else { target = utils.Clamp( target, min, max ); }
		const bias = ( target - min ) / ( max - min );
		// our "random" number
		let x = this.mix( genes, 0, 0xFFFFFFFF );
		// skew the number
		x = utils.shapeNumber( x, 0, 0xFFFFFFFF, bias, influence );
		// map to desired range
		x = utils.MapToRange( x, 0, 0xFFFFFFFF, min, max );
		return x;
	}
	
	shapedInt( genes, min=0, max=0, target=0.5, influence=1 ) {
		return Math.round( this.shapedNumber( genes, min, max, target, influence ) );
	}
	
	// returns a list of deterministic gene codes based on a string.
	// The codes are based on a hash of the string that uses the first 
	// 4 chars of the total DNA as an immutable scramble seed. This 
	// means that gene codes for each organism will be the same, but
	// the content of the genes will vary between individuals.
	// SAFE ZONES: use this to create a gene code in the DNA's safe zone
	// that is relatively free from mutation. Safe zone genes are useful
	// for species feature stability when sudden changes are not wanted.
	// - TRUE if you want all genes to be in the safe zone
	// - postive integer if you want only the first X to be safe.
	// - negative integer if you want only the last X to be safe.
	genesFor( str, num=1, use_safe_zone=false ) {
		const genes = [];
		for ( let i=0; i < num; i++ ) {
			// first 4 chars of the DNA are permanent scramble seed
			let n = utils.murmurhash3_32_gc( str+`.${i}`, parseInt( this.str.substr(0,4), 16 ) );
			// safe zone zeroes out the 3rd and 4th position as a hint to the gene reader, e.g. 0xFFFF00FF 
			if ( 
				// if TRUE, use safe zone for all genes
				(use_safe_zone===true) ||
				// if its a positive number, we want that many to start with and the rest can be anything 
				( use_safe_zone > 0 && i < use_safe_zone ) ||
				// if its a negative number, we want that many to end with and the rest can be anything 
				( use_safe_zone < 0 && i >= num+use_safe_zone )
				) {
				n = (n & ~(0xFF << 8)) >>> 0;
			}
			genes.push(n);
		}
		return genes;
	}
	
	mutate( num_mutations=1, protect_read_only_zone=true ) {
		// if protect_read_only_zone is true|false, stick with that.
		// if it is a number between 0..1, interpret as a chance to flip from false->true.
		if ( protect_read_only_zone !== true && protect_read_only_zone !== false ) {
			let readonly_chance = Number.parseFloat(protect_read_only_zone);
			if ( readonly_chance ) {
				readonly_chance = utils.Clamp( readonly_chance, 0, 1 );
				protect_read_only_zone = Math.random() < readonly_chance;
			}
		}
		for ( let n = 0; n < num_mutations; n++ ) {
			const option = DNA.mutationOptionPicker.Pick();
			const first_char = (protect_read_only_zone && this.str.length > 0xFF) ? 0xFF+1 : 4; // first 4 chars are scramble seed
			const i = utils.BiasedRandInt( 
				first_char, this.str.length-1, 
				first_char + (((this.str.length-1)-first_char)/2), 
				0.5 // draw more from the middle
			);
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