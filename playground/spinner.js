
/**
 * Three.js WebGPU Spinner!
 * ---
 * Three.js TSL Port by Bandinopla -> https://x.com/Bandinopla
 * Based on the work of Paidax01 -> https://x.com/xin_pai88825/status/2039540901752774668
 * Inspired by Mike Bespalov -> https://x.com/bbssppllvv/status/2038718410318659763
 * ---
 */ 	

import { attribute, float, PI2, time, vec3, mix, select, hash, PI } from "three/tsl";
import * as THREE from "three/webgpu";

export class Spinner extends THREE.Points { 

	constructor(config, plotFunction) {
		const geometry = new THREE.BufferGeometry();

		// material
	    const material = new THREE.PointsNodeMaterial({
	        //positionNode: attribute("position").toVec3().mul(0.5).add( time.sin().mul(0.1) ),
			blending: THREE.AdditiveBlending,
	    });  

		super(geometry, material)

		this.config = config;
		this.plotFunction = plotFunction;
 
		this.rebuild(config); 
	} 

	rebuild( config ) {
		const pointsPerParticle = config.strokeWidth ;
		const totalParticles = pointsPerParticle * config.particleCount;

		const indices = new Float32Array(totalParticles);

		for (let i = 0; i < totalParticles; i++) indices[i] = i;

		this.geometry.setAttribute("indexAttr", new THREE.BufferAttribute(indices, 1));
		this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(totalParticles*3), 3));

		const pointIndex = attribute("indexAttr"); 

		const particleIndex = pointIndex.toFloat().div(pointsPerParticle).floor();
 
		const progress = particleIndex.div(config.particleCount) 
		//const origin = pointFunctionAsNode(card.pointFunction, config)( progress , float(.7).add(time.mul(3).sin().mul(0.02)) )
		const origin = this.plotFunction( progress , float(.7).add(time.mul(3).sin().mul(0.02)), config )

		const animatedProgress = time.div(4).mod(1); 
		const trailLength = float(0.3);  
		const animationGradient =  progress.sub(animatedProgress).add(1).mod(1);
		const insideTrail = animationGradient.lessThanEqual(trailLength);
		const gradient = select( insideTrail, animationGradient.add(0.1), float(config.strokeWidth*.7) )

		const rand = hash(particleIndex); 
		const length = float(config.strokeWidth ).mul(gradient) .mul(pointIndex.toFloat().mod(14).div(14)).mul(.3 ) 
		const ang = PI2.mul(rand);

		const mat = this.material ;

		mat.positionNode = origin.add( vec3(ang.cos(), ang.sin(), 0).mul(length) ).mul( float(1).add(time.sin().mul(0.01) )) ;
		mat.colorNode = mix(vec3(.01,.01,.01),vec3(1,1,1), insideTrail.toFloat()).mul(3)
		mat.needsUpdate = true;
		mat.opacityNode = gradient.add(0.2).mul(animationGradient.div(2));
	}

	dispose() { 
		this.geometry.dispose();
		(this.material).dispose();
	}
}

/**
 * This is a function that will return a vec3 position based on a progress value.
 * Useful for cusing the curve logic for something else than a simple spinner. Maybe to drive the 
 * movement of some particles?? 
 * 
 * @param progress - The progress of the curve, from 0 to 1.
 * @param detailScale - The detail scale of the curve.
 * @param config - The config of the curve.
 * @returns A vec3 position ( z is not used, it is set to 0 )
 */
export const plotFunction = (progress, detailScale, config) => {
	const t = PI2.mul(progress)

	const amp = float(config.lissajousAmp).add(detailScale.mul(config.lissajousAmpBoost))

	const ax = float(config.lissajousAX)
	const by = float(config.lissajousBY)

	const x = t.mul(ax).add(config.lissajousPhase).sin().mul(amp)
	const y = t.mul(by).sin().mul(amp.mul(config.lissajousYScale))

	return vec3(
		x,
		y,
		0
	)
};

/**
 * Add this object to the stage, you may want to touch the scale of it to suit your needs.
 * It is a THREE.Points object
 */
export const spinner = new Spinner({"strokeWidth":0.3,"particleCount":100000,"lissajousAmp":0.24,"lissajousAmpBoost":0.1,"lissajousAX":3,"lissajousBY":4,"lissajousPhase":1.57,"lissajousYScale":0.92}, plotFunction);
			