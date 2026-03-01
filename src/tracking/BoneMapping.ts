/**
 * The bone mapping to use for the rig.
 */
export type BoneMap = {
	faceMesh:string
	head: string;
	hips:string
	neck:string
	torso:string
	armL:string
	forearmL:string

	armR:string
	forearmR:string

	thighL:string
	shinL:string
	footL:string

	thighR:string
	shinR:string
	footR:string
	 
	
	handL:string
	index1L:string
	index2L:string
	index3L:string

	middle1L:string
	middle2L:string
	middle3L:string

	ring1L:string
	ring2L:string
	ring3L:string

	pinky1L:string
	pinky2L:string
	pinky3L:string

	thumb1L:string
	thumb2L:string
	thumb3L:string

	handR:string
	index1R:string
	index2R:string
	index3R:string

	middle1R:string
	middle2R:string
	middle3R:string

	ring1R:string
	ring2R:string
	ring3R:string

	pinky1R:string
	pinky2R:string
	pinky3R:string

	thumb1R:string
	thumb2R:string
	thumb3R:string
 
}

export const defaultBoneMap:BoneMap = {
	faceMesh:"face",
	
	head: "head",
	hips:"hips",
	neck:"neck",
	torso:"torso",

	armL:"upper_armL",
	forearmL:"forearmL",

	armR:"upper_armR",
	forearmR:"forearmR",

	thighL:"thighL",
	shinL:"shinL",
	footL:"footL",

	thighR:"thighR",
	shinR:"shinR",
	footR:"footR",
	 
	
	handL:"handL",
	index1L:"index1L",
	index2L:"index2L",
	index3L:"index3L",

	middle1L:"middle1L",
	middle2L:"middle2L",
	middle3L:"middle3L",

	ring1L:"ring1L",
	ring2L:"ring2L",
	ring3L:"ring3L",

	pinky1L:"pinky1L",
	pinky2L:"pinky2L",
	pinky3L:"pinky3L",

	thumb1L:"thumb1L",
	thumb2L:"thumb2L",
	thumb3L:"thumb3L",

	handR:"handR",
	index1R:"index1R",
	index2R:"index2R",
	index3R:"index3R",

	middle1R:"middle1R",
	middle2R:"middle2R",
	middle3R:"middle3R",

	ring1R:"ring1R",
	ring2R:"ring2R",
	ring3R:"ring3R",

	pinky1R:"pinky1R",
	pinky2R:"pinky2R",
	pinky3R:"pinky3R",

	thumb1R:"thumb1R",
	thumb2R:"thumb2R",
	thumb3R:"thumb3R",
 
}