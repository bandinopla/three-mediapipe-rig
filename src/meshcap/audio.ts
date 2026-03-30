import { start } from "repl";
import { MCapClip, RecordedClip } from "./types";

export type AudioSpriteAtlas = {
	blob:Blob
	sprites: ([start:number, duration:number]|undefined)[]
} 

async function audioSourceToArrayBuffer(source: File | Blob | string | ArrayBuffer): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return source;
  }

  if (source instanceof File || source instanceof Blob) {
    return source.arrayBuffer();
  }

  if (typeof source === 'string') {
    const res = await fetch(source);
    return res.arrayBuffer();
  }

  throw new Error(`Unsupported audio source type: ${typeof source}`);
}

/**
 * Will complete the missing audio element on the clips by extracting the audio clip from the atlas.
 * 
 * @param audioFile The audio file to extract sprites from.
 * @param clips The clips to extract sprites for.
 * @returns An array of audio elements, one for each clip ( undefined if no audio sprite is defined for that clip)
 */
export async function extractAudioSprites(audioFile:File | Blob | string | ArrayBuffer, clips:RecordedClip[]):Promise<AudioSpriteAtlas> {
   // Decode the file
   const ctx = new AudioContext();
   const arrayBuffer = await audioSourceToArrayBuffer(audioFile);
   const sourceBuffer = await ctx.decodeAudioData(arrayBuffer);
   const audios:(HTMLAudioElement|undefined)[]=[];

   for( const clip of clips ) {
		if( !clip.audioSprite ) {
			audios.push(undefined);
			continue;
		}
		const startSample  = Math.floor(clip.audioSprite.start    * sourceBuffer.sampleRate);
    	const lengthSample = Math.floor(clip.duration * sourceBuffer.sampleRate);

		// create a buffer just for this clip
	    const clipBuffer = ctx.createBuffer(
	      sourceBuffer.numberOfChannels,
	      lengthSample,
	      sourceBuffer.sampleRate
	    );

		// copy the slice from each channel
	    for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
	      const src  = sourceBuffer.getChannelData(ch).subarray(startSample, startSample + lengthSample);
	      clipBuffer.getChannelData(ch).set(src);
	    }

		// encode slice to WAV → Blob → HTMLAudioElement
	    const wav  = audioBufferToWav(clipBuffer);
	    const blob = new Blob([wav], { type: 'audio/wav' });
	    const url  = URL.createObjectURL(blob); 
	    const el   = new Audio(url);

		clip.audioSprite.domElement = el;

		console.log("Assigned audio to clip: ", clip.name, " at ", clip.audioSprite.start, " for ", clip.duration, " seconds");

		audios.push(el);
   }

   ctx.close();

   return {
		blob:new Blob([arrayBuffer], { type: 'audio/wav' }),
		sprites: clips.map(c => c.audioSprite ? [c.audioSprite.start, c.duration] : undefined)
   };
}

export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const ab = new ArrayBuffer(44 + length);
  const view = new DataView(ab);

  const write = (offset: number, str: string) =>
    [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));

  write(0,  'RIFF');  view.setUint32(4,  36 + length, true);
  write(8,  'WAVE');  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,           true);  // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate,  true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16,          true);
  write(36, 'data');  view.setUint32(40, length, true);

  let pos = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(pos, s * 0x7fff, true);
      pos += 2;
    }
  }

  return ab;
}

export type AudioAtlasPlayer = {
	stopCurrent:()=>void
	playSprite:(clipIndex:number)=>AudioBufferSourceNode|undefined
	setVolume:(value: number)=>void
}


const atlasAudioContext = new WeakMap<AudioBuffer, AudioContext>();

/**
 * Creates a player that can play the audio sprites of the clips.
 * @param audioBuffer The audio buffer that contains the audio for the clips.
 * @param clips The meshcap clips
 * @returns A player that can play the audio sprites of the clips.
 */
export function createAudioAtlasPlayer( audioBuffer:AudioBuffer, clips:MCapClip[] ) : AudioAtlasPlayer{
 
	const ctx = atlasAudioContext.get(audioBuffer) || new AudioContext();
	atlasAudioContext.set(audioBuffer, ctx);

	const gainNode = ctx.createGain();
	gainNode.connect(ctx.destination);

	gainNode.gain.value =  1

	let currentlyPlaying:AudioBufferSourceNode|undefined;
 
	return {
		stopCurrent() {
			if( currentlyPlaying ) {
				currentlyPlaying.stop();
				currentlyPlaying = undefined;
			}
		},

		setVolume(value: number) {
			gainNode.gain.value = value;
		},

		/** 
		 * @param clipIndex Index of the clip to play
		 * @returns The audio buffer source node that is playing the audio.
		 */
		playSprite(clipIndex:number) {
 
			this.stopCurrent();

			const clip = clips[clipIndex];
			if( !clip.audioSprite ) return;  

		    const source = ctx.createBufferSource();
		    source.buffer = audioBuffer;
		    source.connect(gainNode);
			
		    source.start(0, clip.audioSprite.start, clip.duration);

			currentlyPlaying = source;
			console.log("PLAYING SOUNC", clip.name)
			 
		    return source; // keep ref if you need to stop it early
		}
	} 
}